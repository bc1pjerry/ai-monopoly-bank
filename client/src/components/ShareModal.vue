<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal" style="width:min(94vw,560px);">
      <h3 style="margin:0 0 4px;">分享专属链接</h3>
      <p class="muted" style="margin-top:4px; margin-bottom:12px;">把对应链接发给对应的人，每人只能操作自己的角色。</p>

      <!-- 庄家 PC 链接 -->
      <div style="margin-bottom:8px;">
        <div style="font-size:11px; color:#a7b0cf; text-transform:uppercase; letter-spacing:.08em; font-weight:600; margin-bottom:6px;">庄家 · 电脑大屏</div>
        <div class="token-item">
          <span class="tname" style="color:#fef3c7;">庄家</span>
          <span class="tlink">{{ buildLink(roomId, bankerToken) }}</span>
          <button class="yellow-btn mini" @click="copy(buildLink(roomId, bankerToken))">复制</button>
          <button class="secondary mini" @click="openQr(buildLink(roomId, bankerToken), '庄家链接（大屏）')">二维码</button>
        </div>
      </div>

      <!-- 庄家手机控制链接 -->
      <div style="margin-bottom:14px;">
        <div style="font-size:11px; color:#a7b0cf; text-transform:uppercase; letter-spacing:.08em; font-weight:600; margin-bottom:6px;">庄家 · 手机控制台</div>
        <div class="token-item" style="border-color:rgba(124,58,237,.4); background:rgba(124,58,237,.08);">
          <span class="tname" style="color:#c4b5fd;">手机</span>
          <span class="tlink">{{ buildMobileLink(roomId, bankerToken) }}</span>
          <button class="secondary mini" style="border-color:rgba(124,58,237,.4); color:#c4b5fd;" @click="copy(buildMobileLink(roomId, bankerToken))">复制</button>
          <button class="secondary mini" style="border-color:rgba(124,58,237,.4); color:#c4b5fd;" @click="openQr(buildMobileLink(roomId, bankerToken), '庄家手机控制台')">二维码</button>
        </div>
      </div>

      <!-- 玩家链接 -->
      <div style="font-size:11px; color:#a7b0cf; text-transform:uppercase; letter-spacing:.08em; font-weight:600; margin-bottom:6px;">玩家链接</div>
      <div class="token-list">
        <div class="token-item" v-for="pt in playerTokens" :key="pt.id">
          <span class="tname">{{ pt.name }}</span>
          <span class="tlink">{{ buildLink(roomId, pt.token) }}</span>
          <button class="secondary mini" @click="copy(buildLink(roomId, pt.token))">复制</button>
          <button class="secondary mini" @click="openQr(buildLink(roomId, pt.token), pt.name + '的链接')">二维码</button>
        </div>
      </div>

      <div style="margin-top:14px;">
        <button class="secondary" style="width:100%;" @click="$emit('close')">关闭</button>
      </div>
    </div>
  </div>

  <!-- 二维码弹窗 -->
  <div class="modal-backdrop" v-if="qrVisible" @click.self="qrVisible = false">
    <div class="modal">
      <h3 style="margin:0 0 4px;">{{ qrTitle }}</h3>
      <img class="qr" :src="`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrUrl)}`" alt="二维码" />
      <div class="link-box" style="font-size:12px;">{{ qrUrl }}</div>
      <div style="margin-top:12px; display:flex; gap:10px;">
        <button class="primary" @click="copy(qrUrl)">复制链接</button>
        <button class="secondary" @click="qrVisible = false">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { buildLink, buildMobileLink } from '../composables/api.js'

defineProps({
  roomId: String,
  bankerToken: String,
  playerTokens: Array
})
defineEmits(['close'])

const qrVisible = ref(false)
const qrTitle = ref('')
const qrUrl = ref('')

function openQr(url, title) {
  qrUrl.value = url
  qrTitle.value = title
  qrVisible.value = true
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    alert('链接已复制')
  } catch {
    alert('复制失败，请手动复制')
  }
}
</script>
