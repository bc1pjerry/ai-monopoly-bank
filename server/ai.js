/**
 * AI Gateway — 兼容 OpenAI 格式，代理到小米 Mimo 模型
 *
 * Base URL : https://token-plan-cn.xiaomimimo.com/v1
 * Model    : xiaomi-mimo-Omni
 * Auth     : Bearer $XIAOMI_API_KEY
 *
 * 对外暴露：
 *   chat(messages, options?)  → Promise<string>   普通调用，返回 assistant 回复文本
 *   chatStream(messages, options?, onChunk?)       流式调用，逐块回调
 *   createAiHandler()                              返回适合在 server.js 挂载的 HTTP handler
 */

'use strict';

const https = require('https');

const XIAOMI_BASE_URL = 'https://token-plan-cn.xiaomimimo.com/v1';
const DEFAULT_MODEL   = 'xiaomi-mimo-Omni';

// ─── 底层请求工具 ─────────────────────────────────────────────────────────────

/**
 * 向小米 Mimo 发送 chat completion 请求（非流式）
 * @param {Array}  messages  OpenAI 格式 messages 数组
 * @param {Object} options   可选覆盖项 { model, temperature, max_tokens, ... }
 * @returns {Promise<Object>} 原始 OpenAI 格式响应体
 */
function callChatCompletion(messages, options = {}) {
  const apiKey = process.env.XIAOMI_API_KEY;
  if (!apiKey) throw new Error('XIAOMI_API_KEY 环境变量未设置');

  const payload = JSON.stringify({
    model: options.model || DEFAULT_MODEL,
    messages,
    stream: false,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 2048,
    ...options.extra
  });

  return new Promise((resolve, reject) => {
    const url = new URL(`${XIAOMI_BASE_URL}/chat/completions`);
    const reqOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(reqOptions, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (res.statusCode >= 400) {
            reject(new Error(`Xiaomi API error ${res.statusCode}: ${raw}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`解析响应失败: ${raw}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy(new Error('请求超时'));
    });
    req.write(payload);
    req.end();
  });
}

/**
 * 向小米 Mimo 发送流式 chat completion 请求（SSE）
 * @param {Array}    messages
 * @param {Object}   options
 * @param {Function} onChunk  (deltaText: string) => void  每次收到文本片段时回调
 * @returns {Promise<string>} 完整的 assistant 回复文本
 */
function callChatCompletionStream(messages, options = {}, onChunk = null) {
  const apiKey = process.env.XIAOMI_API_KEY;
  if (!apiKey) return Promise.reject(new Error('XIAOMI_API_KEY 环境变量未设置'));

  const payload = JSON.stringify({
    model: options.model || DEFAULT_MODEL,
    messages,
    stream: true,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 2048,
    ...options.extra
  });

  return new Promise((resolve, reject) => {
    const url = new URL(`${XIAOMI_BASE_URL}/chat/completions`);
    const reqOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    let fullText = '';
    let buffer = '';

    const req = https.request(reqOptions, (res) => {
      if (res.statusCode >= 400) {
        let errRaw = '';
        res.on('data', c => errRaw += c);
        res.on('end', () => reject(new Error(`Xiaomi API error ${res.statusCode}: ${errRaw}`)));
        return;
      }

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // 最后一行可能不完整，留给下次

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              if (onChunk) onChunk(delta);
            }
          } catch {
            // 忽略格式异常的行
          }
        }
      });

      res.on('end', () => resolve(fullText));
      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy(new Error('流式请求超时'));
    });
    req.write(payload);
    req.end();
  });
}

// ─── 高层 API ─────────────────────────────────────────────────────────────────

/**
 * 普通对话调用，返回 assistant 回复的文本字符串
 * @param {Array}  messages  OpenAI 格式 messages
 * @param {Object} options   { model, temperature, max_tokens, extra }
 * @returns {Promise<string>}
 */
async function chat(messages, options = {}) {
  const resp = await callChatCompletion(messages, options);
  const text = resp.choices?.[0]?.message?.content;
  if (text == null) throw new Error('响应中未找到 content: ' + JSON.stringify(resp));
  return text;
}

/**
 * 流式对话调用
 * @param {Array}    messages
 * @param {Object}   options
 * @param {Function} onChunk  (deltaText: string) => void
 * @returns {Promise<string>} 完整回复文本
 */
async function chatStream(messages, options = {}, onChunk = null) {
  return callChatCompletionStream(messages, options, onChunk);
}

// ─── HTTP Handler（供 server.js 挂载） ────────────────────────────────────────

/**
 * 创建挂载到 /api/ai/chat 的 HTTP handler
 *
 * POST /api/ai/chat
 * Body: { messages: [...], model?, temperature?, max_tokens?, stream? }
 *
 * 非流式：返回 { ok: true, content: "..." }
 * 流式  ：返回 text/event-stream，格式同 OpenAI SSE
 */
function createAiHandler() {
  return async function aiHandler(req, res, reqBody) {
    const messages = reqBody.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: 'messages 字段缺失或为空' }));
    }

    const options = {
      model:       reqBody.model       || DEFAULT_MODEL,
      temperature: reqBody.temperature,
      max_tokens:  reqBody.max_tokens
    };
    const isStream = !!reqBody.stream;

    if (isStream) {
      res.writeHead(200, {
        'Content-Type':  'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive'
      });

      try {
        await chatStream(messages, options, (delta) => {
          const payload = JSON.stringify({ choices: [{ delta: { content: delta } }] });
          res.write(`data: ${payload}\n\n`);
        });
        res.write('data: [DONE]\n\n');
      } catch (e) {
        res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      }
      return res.end();
    }

    // 非流式
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
