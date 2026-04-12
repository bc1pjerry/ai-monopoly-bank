/**
 * AI Gateway — 代理到小米 Mimo 模型
 *
 * Base URL : https://token-plan-cn.xiaomimimo.com/v1
 * Model    : mimo-v2-omni
 * Auth     : Bearer $XIAOMI_API_KEY
 * 注意     : 图片必须是 JPEG/JPG 格式的 base64，PNG 会被拒绝（400）
 *            参数用 max_completion_tokens，不是 max_tokens
 *
 * 对外暴露：
 *   chat(messages, options?)  → Promise<string>
 *   chatStream(messages, options?, onChunk?)
 *   createAiHandler()
 */

'use strict';

const https = require('https');

const XIAOMI_BASE_URL = 'https://api.xiaomimimo.com/v1';
const DEFAULT_MODEL   = 'mimo-v2-omni';

const SYSTEM_MESSAGE = {
  role: 'system',
  content: 'You are MiMo, an AI assistant developed by Xiaomi.'
};

// ─── 工具：确保 messages 首条是 system message ────────────────────────────────

function withSystem(messages) {
  if (messages[0]?.role === 'system') return messages;
  return [SYSTEM_MESSAGE, ...messages];
}

// ─── 底层请求工具 ─────────────────────────────────────────────────────────────

function callChatCompletion(messages, options = {}) {
  const apiKey = process.env.XIAOMI_API_KEY;
  if (!apiKey) throw new Error('XIAOMI_API_KEY 环境变量未设置');

  // max_completion_tokens 是 mimo API 的正确参数名
  const maxTokens = options.max_tokens ?? options.max_completion_tokens ?? 2048;

  const payload = JSON.stringify({
    model: options.model || DEFAULT_MODEL,
    messages: withSystem(messages),
    stream: false,
    ...(options.temperature != null ? { temperature: options.temperature } : {}),
    max_completion_tokens: maxTokens,
    ...options.extra
  });

  return new Promise((resolve, reject) => {
    const url = new URL(`${XIAOMI_BASE_URL}/chat/completions`);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try {
          const json = JSON.parse(raw);
          if (res.statusCode >= 400) {
            reject(new Error(`Xiaomi API ${res.statusCode}: ${raw}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`解析响应失败: ${raw}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(90000, () => req.destroy(new Error('请求超时')));
    req.write(payload);
    req.end();
  });
}

function callChatCompletionStream(messages, options = {}, onChunk = null) {
  const apiKey = process.env.XIAOMI_API_KEY;
  if (!apiKey) return Promise.reject(new Error('XIAOMI_API_KEY 环境变量未设置'));

  const maxTokens = options.max_tokens ?? options.max_completion_tokens ?? 2048;

  const payload = JSON.stringify({
    model: options.model || DEFAULT_MODEL,
    messages: withSystem(messages),
    stream: true,
    ...(options.temperature != null ? { temperature: options.temperature } : {}),
    max_completion_tokens: maxTokens,
    ...options.extra
  });

  return new Promise((resolve, reject) => {
    const url = new URL(`${XIAOMI_BASE_URL}/chat/completions`);
    let fullText = '';
    let buffer = '';

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      if (res.statusCode >= 400) {
        let errRaw = '';
        res.on('data', c => errRaw += c);
        res.on('end', () => reject(new Error(`Xiaomi API ${res.statusCode}: ${errRaw}`)));
        return;
      }

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) { fullText += delta; if (onChunk) onChunk(delta); }
          } catch { /* 忽略格式异常行 */ }
        }
      });

      res.on('end', () => resolve(fullText));
      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('流式请求超时')));
    req.write(payload);
    req.end();
  });
}

// ─── 高层 API ─────────────────────────────────────────────────────────────────

async function chat(messages, options = {}) {
  const resp = await callChatCompletion(messages, options);
  const msg = resp.choices?.[0]?.message;
  if (!msg) throw new Error('响应中未找到 message: ' + JSON.stringify(resp));
  // mimo-v2-omni 是思考型模型，content 可能为空，回答在 reasoning_content 末尾
  const text = (msg.content && msg.content.trim()) ? msg.content : (msg.reasoning_content || '');
  if (!text) throw new Error('content 与 reasoning_content 均为空');
  return text;
}

async function chatStream(messages, options = {}, onChunk = null) {
  return callChatCompletionStream(messages, options, onChunk);
}

// ─── HTTP Handler ─────────────────────────────────────────────────────────────

function createAiHandler() {
  return async function aiHandler(req, res, reqBody) {
    const messages = reqBody.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: 'messages 字段缺失或为空' }));
    }

    const options = {
      model:       reqBody.model || DEFAULT_MODEL,
      temperature: reqBody.temperature,
      max_tokens:  reqBody.max_tokens ?? reqBody.max_completion_tokens
    };

    if (reqBody.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      try {
        await chatStream(messages, options, (delta) => {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`);
        });
        res.write('data: [DONE]\n\n');
      } catch (e) {
        res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      }
      return res.end();
    }

    try {
      const content = await chat(messages, options);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, content }));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  };
}

module.exports = { chat, chatStream, createAiHandler, DEFAULT_MODEL };
