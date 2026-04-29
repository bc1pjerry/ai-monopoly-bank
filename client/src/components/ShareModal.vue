<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal share-modal">
      <div class="share-head">
        <div>
          <h3 style="margin:0 0 4px;">分享专属链接</h3>
          <p class="muted" style="margin-top:4px; margin-bottom:0;">把对应二维码给对应的人扫，每人只能操作自己的角色。</p>
        </div>
        <div class="join-count">{{ enteredCount }}/{{ playerCards.length }} 已进入</div>
      </div>

      <div class="qr-grid">
        <div
          class="qr-card"
          v-for="card in playerCards"
          :key="card.id"
          :class="{ 'qr-card--entered': card.entered }"
        >
          <div class="qr-card-title">
            <span>{{ card.name }}</span>
            <span v-if="card.entered" class="entered-pill">已进入</span>
          </div>
          <div class="qr-wrap">
            <img class="qr qr-small" :src="qrSrc(card.url)" :alt="card.name + '二维码'" />
            <div class="qr-cover" v-if="card.entered">
              <div class="qr-cover-title">玩家已进入</div>
            </div>
          </div>
          <button class="secondary mini copy-qr-link" @click="copy(card.url)">复制链接</button>
        </div>
      </div>

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
import { computed, ref } from 'vue'
import { buildLink, buildMobileLink } from '../composables/api.js'

const props = defineProps({
  room: Object,
  roomId: String,
  bankerToken: String,
  playerTokens: Array
})
defineEmits(['close'])

const qrVisible = ref(false)
const qrTitle = ref('')
const qrUrl = ref('')

const roomPlayersById = computed(() => {
  const map = new Map()
  for (const player of props.room?.players || []) {
    map.set(player.id, player)
  }
  return map
})

const playerCards = computed(() => (props.playerTokens || []).map((pt) => {
  const player = roomPlayersById.value.get(pt.id)
  return {
    ...pt,
    name: player?.name || pt.name,
    url: buildLink(props.roomId, pt.token),
    entered: Boolean(player?.joined_at || player?.joinedAt)
  }
}))

const enteredCount = computed(() => playerCards.value.filter(card => card.entered).length)

function qrSrc(url, size = 180) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}`
}

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
