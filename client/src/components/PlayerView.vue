<template>
  <div class="player-root" style="padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px));">
    <!-- 顶部 Toast -->
    <transition name="toast-slide">
      <div v-if="showToast" class="top-toast">
        {{ toastMessage }}
      </div>
    </transition>

    <!-- 顶部 hero -->
    <div class="hero">
      <div>
        <h1>大富翁银行</h1>
        <p>房间 {{ room.id }} · {{ room.config.playerCount }} 人局</p>
      </div>
      <div class="toolbar">
        <button class="role-label role-player role-profile-btn" @click="startEditName" title="修改名字和头像">
          <img v-if="me" :src="playerAvatarSrc(me)" :alt="me.name" class="role-player-avatar">
          <span>{{ me?.name }}</span>
        </button>
      </div>
    </div>

    <!-- 我的余额卡片（始终可见） -->
    <div class="my-balance-card">
      <div class="muted" style="font-size:14px; margin-bottom:6px;">我的余额</div>
      <div class="big-bal">¥ {{ fmt(me?.balance) }}</div>
      <div class="my-assets-row">
        <span class="my-assets-label">总资产</span>
        <span class="my-assets-val">¥ {{ fmt(myTotalAssets) }}</span>
        <span class="my-assets-breakdown" v-if="myPropertyValue > 0">（含地产 ¥{{ fmt(myPropertyValue) }}）</span>
      </div>
    </div>

    <section v-if="incomingPropertySales.length > 0" class="card pending-sales-card">
      <div class="pending-sales-head">
        <div>
          <h2>待确认地产交易</h2>
          <p class="muted">接受后才会扣款并完成产权转移。</p>
        </div>
        <span class="pending-sales-count">{{ incomingPropertySales.length }}</span>
      </div>
      <div class="pending-sales-list">
        <div v-for="sale in incomingPropertySales" :key="sale.id" class="pending-sale-item">
          <div class="pending-sale-main">
            <div class="pending-sale-name">{{ sale.propertyName }}</div>
            <div class="pending-sale-meta">{{ playerNameById(sale.sellerId) }} 向你出售</div>
          </div>
          <div class="pending-sale-price">¥{{ fmt(sale.amount) }}</div>
          <div class="pending-sale-actions">
            <button class="pending-sale-btn pending-sale-btn--ghost" @click="respondPropertySale(sale, false)" :disabled="propertySaleDecisionLoading === sale.id">
              拒绝
            </button>
            <button class="pending-sale-btn pending-sale-btn--accept" @click="respondPropertySale(sale, true)" :disabled="propertySaleDecisionLoading === sale.id">
              {{ propertySaleDecisionLoading === sale.id ? '处理中…' : '接受' }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- 页面主内容区 -->
    <div class="page-content">

      <!-- ══════════════════════════════════════
           主页 tab：转账 / 缴款 / 地产
      ══════════════════════════════════════ -->
      <div v-show="activeMainTab === 'home'">
        <!-- 子选项卡 -->
        <div class="sub-tab-bar">
          <button class="sub-tab-btn" :class="{ active: homeTab === 'transfer' }" @click="homeTab = 'transfer'">向玩家转账</button>
          <button class="sub-tab-btn" :class="{ active: homeTab === 'pay' }"      @click="homeTab = 'pay'">向银行缴款</button>
          <button class="sub-tab-btn" :class="{ active: homeTab === 'lottery' }"  @click="homeTab = 'lottery'">彩票</button>
          <button class="sub-tab-btn" :class="{ active: homeTab === 'deeds' }"    @click="homeTab = 'deeds'">我的地产</button>
        </div>

        <!-- 转账面板 -->
        <div v-show="homeTab === 'transfer'" class="card">
          <h2 style="margin-top:0; margin-bottom:14px;">向其他玩家转账</h2>
          
          <div class="field">
            <label>收款人</label>
            <div class="transfer-player-grid" :style="{ gridTemplateColumns: transferGridColumns }">
              <div
                class="transfer-player-item"
                v-for="p in others"
                :key="p.id"
                @click="toPlayerId = p.id; transferReason = 'manual'; showTransferSheet = true;"
              >
                <img :src="playerAvatarSrc(p)" :alt="p.name" class="transfer-player-avatar">
                <div class="transfer-player-name">{{ p.name }}</div>
              </div>
            </div>
          </div>
          
          <NumPad v-model="transferAmount" :quickAmounts="[50,100,200,500,1000]" style="margin-bottom:12px;" />
          <button class="primary" style="width:100%;" @click="submitTransfer">确认转账</button>
        </div>

        <!-- 向银行缴款面板 -->
        <div v-show="homeTab === 'pay'" class="card">
          <h2 style="margin-top:0;">向银行缴款</h2>
          <div class="field">
            <label>缴款类型</label>
            <div class="pay-type-group">
              <button
                v-for="t in payTypes"
                :key="t.value"
                class="pay-type-btn"
                :class="{ active: fineType === t.value }"
                @click="selectPayType(t.value)"
              >
                <span class="pay-type-icon">{{ t.icon }}</span>
                <span>{{ t.label }}</span>
              </button>
            </div>
          </div>
          <div v-if="fineType === 'buy-land'" class="deed-entry">
            <div class="deed-scan-row">
              <button class="deed-scan-btn" @click="openBuyDeedOcr">
                <svg viewBox="0 0 20 20" fill="none" class="deed-scan-icon">
                  <rect x="1" y="5" width="18" height="13" rx="3" stroke="currentColor" stroke-width="1.6"/>
                  <circle cx="10" cy="11" r="3.5" stroke="currentColor" stroke-width="1.6"/>
                  <path d="M7 5 L8.5 2.5 H11.5 L13 5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
                </svg>
                拍摄地契 · 自动录入
              </button>
              <button class="deed-clear-btn" type="button" @click="clearRecognizedDeed">清空</button>
            </div>
            <div v-if="recognizedDeed" class="deed-manual-card">
              <div class="sd-info-group">
                <div class="sd-price-row">
                  <span class="sd-price-label">地契名称</span>
                  <span class="sd-price-val">{{ recognizedDeed.name || '未识别' }}</span>
                </div>
                <div class="sd-price-row">
                  <span class="sd-price-label">购入价格</span>
                  <span class="sd-price-val">{{ recognizedDeed.price != null ? `¥${fmt(recognizedDeed.price)}` : '—' }}</span>
                </div>
                <div class="sd-price-row">
                  <span class="sd-price-label">每层加盖费用</span>
                  <span class="sd-price-val">{{ recognizedDeed.buildUnitCost != null ? `¥${fmt(recognizedDeed.buildUnitCost)}` : '—' }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-if="fineType === 'build'" class="deed-entry">
            <button class="deed-scan-btn build-pick-btn" @click="showBuildPicker = true">
              <svg viewBox="0 0 20 20" fill="none" class="deed-scan-icon">
                <path d="M3 17 L3 9 L10 3 L17 9 L17 17" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
                <rect x="7" y="11" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.6"/>
                <path d="M8 11 V17 M12 11 V17" stroke="currentColor" stroke-width="1" stroke-opacity="0.5"/>
              </svg>
              {{ buildTargetProp ? buildTargetProp.name : '选择建房地块' }}
            </button>
            <div v-if="buildTargetProp" class="build-count-card">
              <div class="build-count-header">
                <span>建楼栋数</span>
                <span v-if="buildTargetPropLevelLabel" class="build-count-sub">当前 {{ buildTargetPropLevelLabel }}</span>
              </div>
              <div v-if="buildMaxCount > 0" class="build-count-options">
                <button
                  v-for="count in buildCountOptions"
                  :key="count"
                  type="button"
                  class="build-count-btn"
                  :class="{ active: buildCount === count }"
                  @click="setBuildCount(count)"
                >{{ count }} 栋</button>
              </div>
              <div v-else class="build-count-full">这块地产已经建满，无法继续加盖</div>
              <div v-if="buildUnitCost > 0 && buildMaxCount > 0" class="build-count-total">
                每层 ¥{{ fmt(buildUnitCost) }}，本次共 ¥{{ fmt(buildTotalCost) }}
              </div>
            </div>
          </div>
          <NumPad v-model="fineAmount" :quickAmounts="fineQuickAmounts" style="margin-bottom:12px;" />
          <button class="red-btn" style="width:100%; border:0;" @click="submitFine">确认缴款</button>
        </div>

        <div v-show="homeTab === 'lottery'" class="card lottery-card">
          <div class="lottery-head">
            <div>
              <h2 style="margin:0;">彩票系统</h2>
              <p class="muted">每 30 分钟开奖一次，每次购买 1 个号码，同一玩家每 2 分钟可再买一次。</p>
            </div>
            <div class="lottery-countdown">
              <span class="lottery-countdown-label">下次开奖</span>
              <strong>{{ lotteryCountdownLabel }}</strong>
            </div>
          </div>

          <div class="lottery-stats">
            <div class="lottery-stat">
              <span>当前奖池</span>
              <strong>¥{{ fmt(lottery.jackpotPool) }}</strong>
            </div>
            <div class="lottery-stat">
              <span>票价</span>
              <strong>¥{{ fmt(lottery.ticketPrice) }}</strong>
            </div>
            <div class="lottery-stat">
              <span>银行加码</span>
              <strong>¥{{ fmt(lotteryBankBonusPreview) }}</strong>
            </div>
          </div>

          <div class="lottery-ticket-summary">
            <span v-if="myLotteryTickets.length">本期已买 {{ myLotteryTickets.length }} 张，最近号码 <strong>{{ myLotteryTickets[myLotteryTickets.length - 1]?.number }}</strong></span>
            <span v-else>本期还未购票</span>
            <span>已售 {{ lottery.tickets.length }} / {{ lottery.numberCount }}</span>
          </div>

          <div v-if="myLotteryTickets.length" class="lottery-my-list">
            <span class="lottery-my-list-label">我买的号码</span>
            <div class="lottery-my-list-chips">
              <span v-for="ticket in myLotteryTickets" :key="ticket.boughtAt + '_' + ticket.number" class="lottery-my-chip">{{ ticket.number }}号</span>
            </div>
          </div>

          <div class="lottery-number-grid">
            <button
              v-for="number in lotteryNumbers"
              :key="number"
              type="button"
              class="lottery-number-btn"
              :class="{ active: selectedLotteryNumber === number, sold: soldLotteryNumbers.has(number), mine: myLotteryNumberSet.has(number) }"
              @click="onLotteryNumberClick(number)"
            >
              <span>{{ number }}</span>
            </button>
          </div>

          <div class="lottery-actions-row">
            <button class="primary lottery-buy-btn" :disabled="!canBuyLottery" @click="submitLotteryPurchase" style="width: 100%;">
              {{ lotteryCooldownLabel ? `${lotteryCooldownLabel} 后可再次购买` : `购买 ${selectedLotteryNumber} 号` }}
            </button>
          </div>

          <div v-if="lottery.lastResult" class="lottery-last-result">
            <div class="lottery-last-title">上期开奖</div>
            <div class="lottery-last-main">{{ lottery.lastResult.winningNumber }} 号</div>
            <div class="lottery-last-meta">
              <span v-if="lottery.lastResult.winnerIds?.length">中奖 {{ lottery.lastResult.winnerIds.length }} 人，每人 ¥{{ fmt(lottery.lastResult.prizePerWinner) }}</span>
              <span v-else>无人中奖，奖池顺延</span>
            </div>
          </div>
        </div>

        <!-- 地产面板 -->
        <div v-show="homeTab === 'deeds'">
          <section class="card">
            <h2 style="margin-top:0;">我的地产</h2>

          <!-- 空状态 -->
          <div v-if="myProperties.length === 0" class="deeds-empty">
            <svg viewBox="0 0 64 64" fill="none" class="deeds-empty-icon">
              <rect x="8" y="20" width="48" height="34" rx="6" stroke="currentColor" stroke-width="2.5" fill="currentColor" fill-opacity="0.06"/>
              <path d="M20 20V16a12 12 0 0 1 24 0v4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
              <rect x="26" y="30" width="12" height="10" rx="3" stroke="currentColor" stroke-width="2" fill="currentColor" fill-opacity="0.15"/>
            </svg>
            <p class="deeds-empty-tip">还没有地产<br/>买地后将在这里显示</p>
          </div>

          <!-- 地产卡片列表 -->
          <div v-else class="deeds-list">
            <div
              class="deed-card-item"
              :class="{ 'deed-card-item--mortgaged': prop.mortgaged }"
              v-for="prop in myProperties"
              :key="prop.id"
              @click="openDeedDetail(prop)"
            >
              <div class="deed-card-left">
                <div class="deed-card-name-row">
                  <span class="deed-card-name">{{ prop.name }}</span>
                  <span v-if="prop.mortgaged" class="deed-mortgaged-badge">已抵押</span>
                </div>
                <div class="deed-card-price">购入价 ¥{{ fmt(prop.price) }}</div>
              </div>
              <div class="deed-card-right">
                <div class="deed-card-rent-preview" v-if="!prop.mortgaged && currentRent(prop) != null">
                  {{ currentRentLabel(prop) }} ¥{{ fmt(currentRent(prop)) }}
                </div>
                <svg viewBox="0 0 16 16" fill="none" class="deed-card-chevron">
                  <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </div>
          </div>

          <!-- 合计 -->
          <div v-if="myProperties.length > 0" class="deeds-total">
            <span>共 {{ myProperties.length }} 处地产</span>
            <span class="deeds-total-val">总价值 ¥{{ fmt(myPropertyValue) }}</span>
          </div>
        </section>
        </div><!-- homeTab=deeds end -->
      </div><!-- activeMainTab=home end -->

      <!-- ══════════════════════════════════════
           战报 tab：战况 / 流水
      ══════════════════════════════════════ -->
      <div v-show="activeMainTab === 'battle'">
        <!-- 子选项卡 -->
        <div class="sub-tab-bar">
          <button class="sub-tab-btn" :class="{ active: battleTab === 'status' }" @click="battleTab = 'status'">玩家战况</button>
          <button class="sub-tab-btn" :class="{ active: battleTab === 'logs' }"   @click="battleTab = 'logs'">交易流水</button>
        </div>

        <!-- 战况面板 -->
        <div v-show="battleTab === 'status'">
          <section class="card">
            <div class="players">
              <div class="player" :class="{ 'is-me': p.id === myPlayerId }" v-for="p in room.players" :key="p.id">
                <div class="player-top">
                  <div class="player-status-head">
                    <img :src="playerAvatarSrc(p)" :alt="p.name" class="battle-player-avatar">
                    <div class="name">{{ p.name }}</div>
                  </div>
                  <span class="me-badge" v-if="p.id === myPlayerId">我</span>
                </div>
                <div class="balance">¥ {{ fmt(p.balance) }}</div>
                <div class="battle-assets-row">
                  <span class="battle-assets-label">总资产</span>
                  <span class="battle-assets-val">¥ {{ fmt(p.balance + getBattlePropertyValue(p.id)) }}</span>
                  <span class="battle-assets-breakdown" v-if="getBattlePropertyValue(p.id) > 0">（地产 ¥{{ fmt(getBattlePropertyValue(p.id)) }}）</span>
                </div>
                <BalanceChart :logs="room.logs" :playerName="p.name" :startBalance="room.config.startingMoney" />
                <div v-if="getPlayerProperties(p.id).length > 0" class="player-properties">
                  <div class="properties-label">地产资产</div>
                  <div class="properties-list">
                    <div class="property-item" v-for="prop in getPlayerProperties(p.id)" :key="prop.id">
                      <span class="property-name">{{ prop.name }}</span>
                      <span class="property-price">¥{{ fmt(prop.price) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- 流水面板 -->
        <div v-show="battleTab === 'logs'">
          <section class="card">
            <LogList :logs="room.logs" :logsTotal="room.logsTotal" :roomId="room.id" :token="myToken" :myPlayerName="me?.name" />
          </section>
        </div>
      </div><!-- activeMainTab=battle end -->

      <!-- ══════════════════════════════════════
           金融 tab：存款 / 贷款
      ══════════════════════════════════════ -->
      <div v-show="activeMainTab === 'finance'">
        <!-- 子选项卡 -->
        <div class="sub-tab-bar">
          <button class="sub-tab-btn" :class="{ active: financeTab === 'deposit' }" @click="financeTab = 'deposit'">存款理财</button>
          <button class="sub-tab-btn" :class="{ active: financeTab === 'loan' }"    @click="financeTab = 'loan'">贷款借贷</button>
        </div>

        <!-- 存款面板 -->
        <div v-show="financeTab === 'deposit'">
          <section class="deposit-section">
            <!-- 当前利率卡 -->
            <div class="deposit-rate-card">
              <div class="deposit-rate-label">当前存款利率</div>
              <div class="deposit-rate-val">{{ room.config.interestRate ?? 1.5 }}%</div>
              <div class="deposit-rate-sub">每 {{ room.config.interestIntervalMin ?? 10 }} 分钟结算复利</div>
            </div>
            <!-- 存款操作 -->
            <div class="deposit-input-card">
              <div class="deposit-input-label">存入金额</div>
              <NumPad v-model="depositAmount" />
              <div class="deposit-preview" v-if="depositAmount > 0">
                预计每期利息：<span class="deposit-preview-val">+¥{{ fmt(Math.round(depositAmount * (room.config.interestRate ?? 1.5) / 100)) }}</span>
              </div>
              <button class="deposit-btn" :disabled="!(depositAmount > 0) || depositLoading" @click="submitDeposit">
                {{ depositLoading ? '处理中...' : '确认存款' }}
              </button>
            </div>
            <!-- 我的存款列表 -->
            <div class="deposit-list-title" v-if="myDeposits.length > 0">我的存款</div>
            <div v-if="myDeposits.length === 0" class="deposit-empty">暂无存款</div>
            <div v-for="dep in myDeposits" :key="dep.id" class="deposit-item">
              <div class="deposit-item-left">
                <div class="deposit-item-amount">¥{{ fmt(dep.amount) }}</div>
                <div class="deposit-item-time">存入于 {{ fmtTime(dep.created_at) }}</div>
              </div>
              <div class="deposit-item-right">
                <div class="deposit-item-rate">{{ room.config.interestRate ?? 1.5 }}% / 期</div>
                <button class="deposit-withdraw-btn" @click="submitWithdraw(dep)">取出</button>
              </div>
            </div>
            <div class="deposit-total" v-if="myDeposits.length > 0">
              <span>存款总额</span>
              <span class="deposit-total-val">¥{{ fmt(myDeposits.reduce((s, d) => s + d.amount, 0)) }}</span>
            </div>
          </section>
        </div><!-- financeTab=deposit end -->

        <!-- 贷款面板 -->
        <div v-show="financeTab === 'loan'">
          <section class="loan-section">
            <!-- 贷款额度卡 -->
            <div class="loan-limit-card">
              <div class="loan-limit-row">
                <span class="loan-limit-label">可贷额度</span>
                <span class="loan-limit-val">¥{{ fmt(myAvailableCredit) }}</span>
              </div>
              <div class="loan-limit-sub">总资产 ¥{{ fmt(myTotalAssets) }} 的 50%，已借 ¥{{ fmt(myTotalDebt) }}</div>
            </div>

            <!-- 贷款申请 -->
            <div class="loan-input-card">
              <div class="loan-input-label">申请金额</div>
              <div class="loan-interest-hint">固定利率 {{ fixedLoanRate }}%/期，为存款利率的 3 倍；每期利息会直接从现金扣除，不累计到剩余本金</div>
              <NumPad v-model="loanAmount" />
              <button class="loan-btn" :disabled="!(loanAmount > 0) || loanLoading || myAvailableCredit <= 0" @click="submitLoan">
                {{ loanLoading ? '处理中...' : '申请贷款' }}
              </button>
            </div>

            <!-- 我的贷款 -->
            <div class="loan-list-title" v-if="myLoans.length > 0">我的贷款</div>
            <div v-if="myLoans.length === 0" class="loan-empty">暂无未还贷款</div>
            <div v-for="loan in myLoans" :key="loan.id" class="loan-item">
              <div class="loan-item-header">
                <span class="loan-item-principal">原借 ¥{{ fmt(loan.principal) }}</span>
                <span class="loan-item-rate loan-rate-badge">{{ loan.rate }}%/期</span>
              </div>
              <div class="loan-item-remaining">
                剩余 <span class="loan-remaining-val">¥{{ fmt(loan.remaining) }}</span>
              </div>
              <div class="loan-repay-row">
                <input class="loan-repay-input" type="number" min="1" :max="loan.remaining" v-model.number="repayAmounts[loan.id]" placeholder="还款金额" />
                <button class="loan-repay-btn" @click="submitRepay(loan)">还款</button>
                <button class="loan-repay-all-btn" @click="repayAmounts[loan.id] = Math.min(loan.remaining, me?.balance || 0); submitRepay(loan)">全还</button>
              </div>
            </div>
            <div class="loan-total" v-if="myLoans.length > 0">
              <span>负债总额</span>
              <span class="loan-total-val">¥{{ fmt(myTotalDebt) }}</span>
            </div>
          </section>
        </div><!-- financeTab=loan end -->
      </div><!-- activeMainTab=finance end -->

    </div><!-- page-content end -->

    <!-- 地契 OCR 弹窗 -->
    <DeedOcrModal v-if="showDeedOcr" @close="showDeedOcr = false" @deed-confirmed="onDeedConfirmed" />

    <!-- 建房地块选择弹窗 -->
    <Transition name="sheet">
      <div v-if="showBuildPicker" class="sheet-overlay" @click.self="showBuildPicker = false">
        <div class="sheet">
          <div class="sheet-header">
            <span class="sheet-title">选择建房地块</span>
            <button class="sheet-close" @click="showBuildPicker = false">✕</button>
          </div>
          <div class="sheet-body">
            <div v-if="myProperties.length === 0" class="build-picker-empty">
              <p>你还没有地产，无法建房。</p>
            </div>
            <div v-else class="build-picker-list">
              <div
                v-for="prop in myProperties"
                :key="prop.id"
                class="build-picker-item"
                :class="{ active: buildTargetProp && buildTargetProp.id === prop.id }"
                @click="selectBuildProp(prop)"
              >
                <div class="build-picker-left">
                  <div class="build-picker-name">{{ prop.name }}</div>
                  <div class="build-picker-sub">购入价 ¥{{ fmt(prop.price) }}</div>
                </div>
                <div class="build-picker-rents">
                  <span
                    v-for="(r, i) in getBuildRentHints(prop)"
                    :key="i"
                    class="build-rent-chip"
                  >{{ r }}</span>
                </div>
                <svg v-if="buildTargetProp && buildTargetProp.id === prop.id" viewBox="0 0 16 16" fill="none" class="build-picker-check">
                  <circle cx="8" cy="8" r="7" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </div>
            <button
              class="primary build-picker-confirm"
              :disabled="!buildTargetProp"
              @click="showBuildPicker = false"
            >确认选择</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 付款原因/转账弹窗 -->
    <Transition name="sheet">
      <div v-if="showTransferSheet" class="sheet-overlay" @click.self="showTransferSheet = false">
        <div class="sheet">
          <div class="sheet-header">
            <span class="sheet-title">向 {{ playerNameById(toPlayerId) }} 转账</span>
            <button class="sheet-close" @click="showTransferSheet = false">✕</button>
          </div>
          <div class="sheet-body">
            <div class="build-picker-list">
              <div
                class="build-picker-item"
                :class="{ active: transferReason === 'manual' }"
                @click="selectTransferReason('manual'); showTransferSheet = false;"
              >
                <div class="build-picker-left">
                  <div class="build-picker-name">手动输入金额</div>
                  <div class="build-picker-sub">自行在下方输入转账金额</div>
                </div>
                <svg v-if="transferReason === 'manual'" class="build-picker-check" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
              </div>

              <div
                class="build-picker-item"
                v-for="prop in transferProperties"
                :key="prop.id"
                :class="{ active: transferReason === prop.id }"
                @click="selectTransferReason(prop.id, prop.mortgaged ? 0 : currentRent(prop)); showTransferSheet = false;"
              >
                <div class="build-picker-left">
                  <div class="build-picker-name" style="display:flex; align-items:center; gap:6px;">
                    {{ prop.name }}
                    <span v-if="prop.mortgaged" class="deed-mortgaged-badge">抵押中</span>
                  </div>
                  <div class="build-picker-sub">过路费 ({{ currentRentLabel(prop) }})</div>
                </div>
                <div class="build-picker-rents">
                   <div class="build-rent-chip">¥{{ prop.mortgaged ? '0' : fmt(currentRent(prop)) }}</div>
                </div>
                <svg v-if="transferReason === prop.id" class="build-picker-check" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 修改名字弹窗 -->
    <Transition name="sheet">
      <div v-if="showRenameSheet" class="sheet-overlay" @click.self="showRenameSheet = false">
        <div class="sheet">
          <div class="sheet-header">
            <span class="sheet-title">修改名字</span>
            <button class="sheet-close" @click="showRenameSheet = false">✕</button>
          </div>
          <div class="sheet-body rename-sheet-body">
            <div v-if="me" class="rename-profile-preview">
              <img :src="renamePreviewAvatarSrc" :alt="renameInput || me.name" class="rename-current-avatar">
              <div>
                <div class="rename-preview-title">昵称与头像</div>
                <div class="rename-preview-sub">修改后会立即同步到当前房间所有玩家</div>
              </div>
            </div>
            <input 
              ref="renameInputRef"
              v-model="renameInput" 
              class="sd-edit-input sd-edit-input--text" 
              style="width: 100%; text-align: left; padding: 14px 16px; font-size: 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #fff; box-sizing: border-box; outline: none;" 
              maxlength="20" 
              placeholder="请输入新名字" 
              @keyup.enter="submitRenameSheet"
            />
            <div class="avatar-picker-grid">
              <button
                v-for="avatar in avatarOptions"
                :key="avatar.id"
                type="button"
                class="avatar-picker-btn"
                :class="{ active: renameAvatarId === avatar.id }"
                @click="renameAvatarId = avatar.id"
              >
                <img :src="avatar.src" :alt="avatar.label" class="avatar-picker-img">
                <span>{{ avatar.label }}</span>
              </button>
            </div>
            <button class="primary" style="width: 100%; padding: 14px; font-size: 16px; border-radius: 12px; font-weight: 600;" @click="submitRenameSheet">确认修改</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 地产详情弹窗 -->
    <Transition name="sheet">
      <div v-if="deedDetailProp" class="sheet-overlay" @click.self="closeDeedDetail">
        <div class="sheet">
          <div class="sheet-header">
            <span class="sheet-title">{{ deedDetailProp.name }}</span>
            <button class="sheet-close" @click="closeDeedDetail">✕</button>
          </div>
          <div class="sheet-body">

            <!-- ── 详情视图 ── -->
            <template v-if="sellStep === 'detail'">
              <!-- 基本信息 -->
              <div class="sd-info-group">
                <div class="sd-price-row">
                  <span class="sd-price-label">购入价格</span>
                  <span class="sd-price-val">¥{{ fmt(deedDetailProp.price) }}</span>
                </div>
                <div class="sd-price-row">
                  <span class="sd-price-label">已建楼栋</span>
                  <span class="sd-price-val">{{ propertyLevelLabel(deedDetailProp) }}</span>
                </div>
                <div class="sd-price-row">
                  <span class="sd-price-label">每层加盖费用</span>
                  <span class="sd-price-val">¥{{ fmt(buildUnitCostForProperty(deedDetailProp)) }}</span>
                </div>
                <div class="sd-price-row">
                  <span class="sd-price-label">已累计加盖金额</span>
                  <span class="sd-price-val">¥{{ fmt(Number(deedDetailProp.build_cost || 0)) }}</span>
                </div>
              </div>
              <!-- 已抵押状态提示 -->
              <div v-if="deedDetailProp.mortgaged" class="sd-mortgaged-notice">
                <svg viewBox="0 0 20 20" fill="none" class="sd-mortgaged-notice-icon">
                  <circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="1.6"/>
                  <path d="M10 6v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  <circle cx="10" cy="13.5" r="1" fill="currentColor"/>
                </svg>
                <span>此地产已抵押，过路费暂停收取</span>
              </div>
              <!-- 过路费表格 -->
              <div class="sd-rents-title">过路费一览</div>
              <div class="sd-rents-table">
                <div
                  class="sd-rent-row"
                  v-for="(label, i) in rentLabels"
                  :key="i"
                  :class="{ 'sd-rent-row--highlight': i === currentRentIndex(deedDetailProp) }"
                >
                  <div class="sd-rent-level">
                    <span class="sd-rent-icon">{{ rentIcons[i] }}</span>
                    <span class="sd-rent-label-text">{{ label }}</span>
                  </div>
                  <span class="sd-rent-amount" :class="{ 'sd-rent-amount--hotel': i === 5, 'sd-rent-amount--mortgaged': deedDetailProp.mortgaged }">
                    {{ deedDetailProp.mortgaged ? '¥0' : (parsedRents(deedDetailProp)[i] != null ? '¥' + fmt(parsedRents(deedDetailProp)[i]) : '—') }}
                  </span>
                </div>
              </div>
              <!-- 操作按钮区 -->
              <div class="sd-actions-group">
                <button class="sd-edit-btn" @click="startEditDeed">
                  修改地产信息
                </button>
                <!-- 出售按钮行 -->
                <div v-if="!deedDetailProp.mortgaged" class="sd-sell-row">
                  <button class="sd-sell-bank-btn" @click="startSell('bank')">
                    <!-- 银行图标 -->
                    <svg viewBox="0 0 24 24" fill="none" class="sd-sell-icon">
                      <rect x="2" y="7" width="20" height="13" rx="2.5" stroke="currentColor" stroke-width="1.8"/>
                      <path d="M2 11h20" stroke="currentColor" stroke-width="1.8"/>
                      <path d="M12 2 L22 7 H2 Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="currentColor" fill-opacity="0.15"/>
                      <rect x="9" y="14" width="6" height="4" rx="1" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.2"/>
                    </svg>
                    <div class="sd-sell-btn-content">
                      <span class="sd-sell-btn-label">出售给银行</span>
                      <span class="sd-sell-btn-sub">¥{{ fmt(Math.floor(deedDetailProp.price / 2)) }}</span>
                    </div>
                  </button>
                  <button class="sd-sell-player-btn" @click="startSell('player')">
                    <!-- 玩家图标 -->
                    <svg viewBox="0 0 24 24" fill="none" class="sd-sell-icon">
                      <circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.15"/>
                      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                      <path d="M17 10l2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <div class="sd-sell-btn-content">
                      <span class="sd-sell-btn-label">出售给玩家</span>
                      <span class="sd-sell-btn-sub">自定义金额</span>
                    </div>
                  </button>
                </div>
                <!-- 出售房产按钮行（有建房时显示） -->
                <div v-if="!deedDetailProp.mortgaged && Number(deedDetailProp.build_count || 0) > 0" class="sd-sell-building-row">
                  <button class="sd-sell-building-btn" @click="startSellBuilding">
                    <svg viewBox="0 0 24 24" fill="none" class="sd-sell-icon">
                      <rect x="3" y="12" width="8" height="9" rx="1.2" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.1"/>
                      <rect x="13" y="8" width="8" height="13" rx="1.2" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.1"/>
                      <path d="M5 15h4M5 18h4M15 11h4M15 14h4M15 17h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                      <path d="M11 18l-1.5-1.5M11 18l-1.5 1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <div class="sd-sell-btn-content">
                      <span class="sd-sell-btn-label">出售房产给银行</span>
                      <span class="sd-sell-btn-sub">逐级原价出售</span>
                    </div>
                  </button>
                </div>
                <!-- 抵押 / 赎回按钮行 -->
                <div class="sd-mortgage-row">
                  <button v-if="!deedDetailProp.mortgaged" class="sd-mortgage-btn" @click="sellStep = 'mortgage'">
                    <!-- 锁图标 -->
                    <svg viewBox="0 0 24 24" fill="none" class="sd-sell-icon">
                      <rect x="5" y="11" width="14" height="10" rx="2.5" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.12"/>
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                      <circle cx="12" cy="16" r="1.5" fill="currentColor"/>
                    </svg>
                    <div class="sd-sell-btn-content">
                      <span class="sd-sell-btn-label">抵押地产</span>
                      <span class="sd-sell-btn-sub">获得 ¥{{ fmt(Math.floor(deedDetailProp.price / 2)) }}</span>
                    </div>
                  </button>
                  <button v-else class="sd-redeem-btn" @click="sellStep = 'redeem'">
                    <!-- 解锁图标 -->
                    <svg viewBox="0 0 24 24" fill="none" class="sd-sell-icon">
                      <rect x="5" y="11" width="14" height="10" rx="2.5" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.12"/>
                      <path d="M8 11V7a4 4 0 0 1 8 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                      <circle cx="12" cy="16" r="1.5" fill="currentColor"/>
                      <path d="M16 4l2 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    </svg>
                    <div class="sd-sell-btn-content">
                      <span class="sd-sell-btn-label">赎回地产</span>
                      <span class="sd-sell-btn-sub">支付 ¥{{ fmt(redeemCost(deedDetailProp)) }}</span>
                    </div>
                  </button>
                </div>
              </div>
            </template>

            <template v-else-if="sellStep === 'edit'">
              <div class="sd-edit-card">
                <div class="sd-edit-title">手动修正地产信息</div>
                <div class="sd-edit-subtitle">用于修正 OCR 识别错误，不会影响已建楼栋数量。</div>
                <button class="deed-scan-btn sd-edit-ocr-btn" type="button" @click="openEditDeedOcr">
                  <svg viewBox="0 0 20 20" fill="none" class="deed-scan-icon">
                    <rect x="1" y="5" width="18" height="13" rx="3" stroke="currentColor" stroke-width="1.6"/>
                    <circle cx="10" cy="11" r="3.5" stroke="currentColor" stroke-width="1.6"/>
                    <path d="M7 5 L8.5 2.5 H11.5 L13 5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
                  </svg>
                  拍照补录地契
                </button>

                <label class="sd-edit-field">
                  <span class="sd-edit-label">地产名称</span>
                  <input class="sd-edit-input sd-edit-input--text" v-model.trim="editDeedName" maxlength="30" placeholder="输入地产名称" />
                </label>

                <label class="sd-edit-field">
                  <span class="sd-edit-label">购入价格</span>
                  <input class="sd-edit-input" type="number" min="0" step="1" v-model.number="editDeedPrice" placeholder="输入购入价格" />
                </label>

                <label class="sd-edit-field">
                  <span class="sd-edit-label">每层加盖费用</span>
                  <input class="sd-edit-input" type="number" min="0" step="1" v-model.number="editDeedBuildUnitCost" placeholder="输入每层加盖费用" />
                </label>

                <label class="sd-edit-field">
                  <span class="sd-edit-label">已累计加盖金额</span>
                  <input class="sd-edit-input" type="number" min="0" step="1" v-model.number="editDeedBuildCost" placeholder="输入已花费盖楼金额" />
                </label>

                <div class="sd-edit-rents">
                  <div class="sd-edit-section-title">每档过路费</div>
                  <label v-for="(label, i) in rentLabels" :key="label" class="sd-edit-rent-row">
                    <span class="sd-edit-rent-label">{{ label }}</span>
                    <input class="sd-edit-input sd-edit-input--rent" type="number" min="0" step="1" v-model.number="editDeedRents[i]" :placeholder="`输入${label}过路费`" />
                  </label>
                </div>
              </div>
              <div class="sell-actions">
                <button class="sell-back-btn" @click="sellStep = 'detail'">
                  <svg viewBox="0 0 16 16" fill="none" class="sell-back-icon">
                    <path d="M10 4l-4 4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button class="sell-confirm-btn sell-confirm-btn--player" @click="submitEditDeed" :disabled="editDeedLoading">
                  {{ editDeedLoading ? '保存中…' : '保存修改' }}
                </button>
              </div>
            </template>

            <!-- ── 出售给银行确认 ── -->
            <template v-else-if="sellStep === 'bank'">
              <div class="sell-confirm-card">
                <div class="sell-confirm-icon-wrap sell-confirm-icon-wrap--bank">
                  <svg viewBox="0 0 32 32" fill="none" class="sell-confirm-icon">
                    <rect x="3" y="10" width="26" height="17" rx="3" stroke="currentColor" stroke-width="2" fill="currentColor" fill-opacity="0.1"/>
                    <path d="M3 15h26" stroke="currentColor" stroke-width="2"/>
                    <path d="M16 3 L29 10 H3 Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="currentColor" fill-opacity="0.15"/>
                    <rect x="12" y="19" width="8" height="6" rx="1.5" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.2"/>
                  </svg>
                </div>
                <div class="sell-confirm-name">{{ deedDetailProp.name }}</div>
                <div class="sell-confirm-amount">¥{{ fmt(Math.floor(deedDetailProp.price / 2)) }}</div>
                <div class="sell-confirm-hint">购入价的一半</div>
              </div>
              <div class="sell-actions">
                <button class="sell-back-btn" @click="sellStep = 'detail'">
                  <svg viewBox="0 0 16 16" fill="none" class="sell-back-icon">
                    <path d="M10 4l-4 4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button class="sell-confirm-btn sell-confirm-btn--bank" @click="submitSell" :disabled="sellLoading">
                  {{ sellLoading ? '处理中…' : '确认出售' }}
                </button>
              </div>
            </template>

            <!-- ── 出售给玩家 ── -->
            <template v-else-if="sellStep === 'player'">
              <!-- 买家选择 -->
              <div class="sell-buyer-list">
                <div
                  class="sell-buyer-item"
                  v-for="p in others"
                  :key="p.id"
                  :class="{ active: sellToPlayerId === p.id, disabled: hasPendingSaleForCurrentProperty() }"
                  @click="!hasPendingSaleForCurrentProperty() && (sellToPlayerId = p.id)"
                >
                  <img :src="playerAvatarSrc(p)" :alt="p.name" class="sell-buyer-avatar">
                  <div class="sell-buyer-info">
                    <div class="sell-buyer-name">{{ p.name }}</div>
                    <div class="sell-buyer-balance">
                      ¥{{ fmt(p.balance) }}
                      <span v-if="hasPendingSaleForCurrentProperty()"> · 该地产待确认中</span>
                    </div>
                  </div>
                  <svg v-if="sellToPlayerId === p.id" viewBox="0 0 16 16" fill="none" class="sell-buyer-check">
                    <circle cx="8" cy="8" r="7" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
              </div>
              <!-- 金额输入 -->
              <NumPad v-model="sellAmount" :quickAmounts="sellQuickAmounts" style="margin-bottom:4px;" />
              <div class="sell-actions">
                <button class="sell-back-btn" @click="sellStep = 'detail'">
                  <svg viewBox="0 0 16 16" fill="none" class="sell-back-icon">
                    <path d="M10 4l-4 4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button
                  class="sell-confirm-btn sell-confirm-btn--player"
                  @click="submitSell"
                  :disabled="sellLoading || !sellToPlayerId || !(sellAmount > 0) || hasPendingSaleForCurrentProperty()"
                >
                  {{ sellLoading ? '处理中…' : '确认出售' }}
                </button>
              </div>
            </template>

            <!-- ── 抵押确认 ── -->
            <template v-else-if="sellStep === 'mortgage'">
              <div class="sell-confirm-card">
                <div class="sell-confirm-icon-wrap sell-confirm-icon-wrap--mortgage">
                  <svg viewBox="0 0 32 32" fill="none" class="sell-confirm-icon">
                    <rect x="6" y="15" width="20" height="14" rx="3" stroke="currentColor" stroke-width="2" fill="currentColor" fill-opacity="0.1"/>
                    <path d="M11 15V10a5 5 0 0 1 10 0v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <circle cx="16" cy="22" r="2" fill="currentColor"/>
                  </svg>
                </div>
                <div class="sell-confirm-name">{{ deedDetailProp.name }}</div>
                <div class="sell-confirm-amount sell-confirm-amount--mortgage">+¥{{ fmt(Math.floor(deedDetailProp.price / 2)) }}</div>
                <div class="sell-confirm-hint">抵押后过路费暂停，可随时赎回</div>
              </div>
              <div class="sell-actions">
                <button class="sell-back-btn" @click="sellStep = 'detail'">
                  <svg viewBox="0 0 16 16" fill="none" class="sell-back-icon">
                    <path d="M10 4l-4 4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button class="sell-confirm-btn sell-confirm-btn--mortgage" @click="submitMortgage" :disabled="mortgageLoading">
                  {{ mortgageLoading ? '处理中…' : '确认抵押' }}
                </button>
              </div>
            </template>

            <!-- ── 赎回确认 ── -->
            <template v-else-if="sellStep === 'redeem'">
              <div class="sell-confirm-card">
                <div class="sell-confirm-icon-wrap sell-confirm-icon-wrap--redeem">
                  <svg viewBox="0 0 32 32" fill="none" class="sell-confirm-icon">
                    <rect x="6" y="15" width="20" height="14" rx="3" stroke="currentColor" stroke-width="2" fill="currentColor" fill-opacity="0.1"/>
                    <path d="M11 15V10a5 5 0 0 1 10 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <circle cx="16" cy="22" r="2" fill="currentColor"/>
                    <path d="M22 7l2.5 2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                </div>
                <div class="sell-confirm-name">{{ deedDetailProp.name }}</div>
                <div class="sell-confirm-amount sell-confirm-amount--redeem">-¥{{ fmt(redeemCost(deedDetailProp)) }}</div>
                <div class="sell-confirm-hint">含 10% 利息 ¥{{ fmt(Math.floor(Math.floor(deedDetailProp.price / 2) * 0.1)) }}</div>
              </div>
              <div class="sell-actions">
                <button class="sell-back-btn" @click="sellStep = 'detail'">
                  <svg viewBox="0 0 16 16" fill="none" class="sell-back-icon">
                    <path d="M10 4l-4 4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button class="sell-confirm-btn sell-confirm-btn--redeem" @click="submitRedeem" :disabled="mortgageLoading">
                  {{ mortgageLoading ? '处理中…' : '确认赎回' }}
                </button>
              </div>
            </template>

            <!-- ── 出售房产给银行（逐级） ── -->
            <template v-else-if="sellStep === 'sell-building'">
              <div class="sell-confirm-card">
                <div class="sell-confirm-icon-wrap sell-confirm-icon-wrap--sell-building">
                  <svg viewBox="0 0 32 32" fill="none" class="sell-confirm-icon">
                    <rect x="4" y="16" width="10" height="12" rx="1.5" stroke="currentColor" stroke-width="2" fill="currentColor" fill-opacity="0.1"/>
                    <rect x="18" y="12" width="10" height="16" rx="1.5" stroke="currentColor" stroke-width="2" fill="currentColor" fill-opacity="0.1"/>
                    <path d="M7 20h4M7 23h4M21 16h4M21 19h4M21 22h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    <path d="M14 24l2-2 2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
                <div class="sell-confirm-name">{{ deedDetailProp.name }}</div>
                <div class="sd-sell-building-info">
                  当前 {{ propertyLevelLabel(deedDetailProp) }}，每级 ¥{{ fmt(sellBuildingUnitCost) }}
                </div>
                <!-- 选择出售栋数 -->
                <div class="sd-sell-building-picker">
                  <div class="sd-sell-building-label">选择出售栋数</div>
                  <div class="sd-sell-building-options">
                    <button
                      v-for="n in sellBuildingCountOptions"
                      :key="n"
                      class="sd-sell-building-option"
                      :class="{ active: sellBuildingCount === n }"
                      @click="sellBuildingCount = n"
                    >{{ n }}</button>
                  </div>
                </div>
                <div class="sell-confirm-amount sell-confirm-amount--sell-building">+¥{{ fmt(sellBuildingRefund) }}</div>
                <div class="sell-confirm-hint">出售 {{ sellBuildingCount }} 栋房产，按原价退还</div>
              </div>
              <div class="sell-actions">
                <button class="sell-back-btn" @click="sellStep = 'detail'">
                  <svg viewBox="0 0 16 16" fill="none" class="sell-back-icon">
                    <path d="M10 4l-4 4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button class="sell-confirm-btn sell-confirm-btn--sell-building" @click="submitSellBuilding" :disabled="sellBuildingLoading">
                  {{ sellBuildingLoading ? '处理中…' : '确认出售' }}
                </button>
              </div>
            </template>

          </div>
        </div>
      </div>
    </Transition>

    <!-- 底部 tabbar（固定在视窗最底部） -->    <nav class="bottom-tabbar">
      <!-- 主页：钱袋 -->
      <button
        class="tabbar-item"
        :class="{ active: activeMainTab === 'home' }"
        @click="activeMainTab = 'home'"
      >
        <svg class="tabbar-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 8 C12 5 14 3.5 16 3.5 C18 3.5 20 5 20 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
          <path d="M11 9 Q16 7 21 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
          <path d="M10 10 Q5 13 5 18 Q5 26 16 27 Q27 26 27 18 Q27 13 22 10 Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="currentColor" fill-opacity="0.15"/>
          <text x="16" y="22" text-anchor="middle" font-size="9" font-weight="700" fill="currentColor" font-family="sans-serif">$</text>
          <path d="M10 22 Q16 28 22 22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.4"/>
        </svg>
        <span>主页</span>
      </button>

      <!-- 战报：大富翁棋子 -->
      <button
        class="tabbar-item"
        :class="{ active: activeMainTab === 'battle' }"
        @click="activeMainTab = 'battle'"
      >
        <svg class="tabbar-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="11" y="4" width="10" height="3" rx="1.5" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.2"/>
          <rect x="13" y="3" width="6" height="2" rx="1" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.15"/>
          <circle cx="16" cy="11" r="4" stroke="currentColor" stroke-width="2" fill="currentColor" fill-opacity="0.15"/>
          <path d="M12 15 Q10 18 11 22 L21 22 Q22 18 20 15 Q18 14 16 14 Q14 14 12 15Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="currentColor" fill-opacity="0.15"/>
          <rect x="9" y="22" width="14" height="3.5" rx="1.75" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.2"/>
          <rect x="11" y="25.5" width="10" height="2" rx="1" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.15"/>
        </svg>
        <span>战报</span>
      </button>

      <!-- 金融：金币账本卷轴 -->
      <button
        class="tabbar-item"
        :class="{ active: activeMainTab === 'finance' }"
        @click="activeMainTab = 'finance'"
      >
        <svg class="tabbar-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="16" cy="5.5" rx="8" ry="2.5" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.2"/>
          <rect x="8" y="5.5" width="16" height="19" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.1"/>
          <ellipse cx="16" cy="24.5" rx="8" ry="2.5" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.2"/>
          <circle cx="16" cy="13" r="4.5" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.18"/>
          <text x="16" y="16.5" text-anchor="middle" font-size="6.5" font-weight="800" fill="currentColor" font-family="sans-serif">¥</text>
          <line x1="11" y1="20" x2="21" y2="20" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.5"/>
          <line x1="12" y1="22.2" x2="20" y2="22.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.3"/>
        </svg>
        <span>金融</span>
      </button>
    </nav>

    <!-- 暂停覆盖层 -->
    <div v-if="isPaused" class="pause-overlay">
      <div class="pause-overlay-content">
        <div class="pause-icon">⏸</div>
        <h2 class="pause-title">游戏已暂停</h2>
        <p class="pause-desc">庄家已暂停游戏，请等待恢复...</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import LogList from './LogList.vue'
import BalanceChart from './BalanceChart.vue'
import NumPad from './NumPad.vue'
import DeedOcrModal from './DeedOcrModal.vue'
import { fmt, apiWithToken } from '../composables/api.js'
import { avatarOptions, avatarPath, normalizeAvatarId } from '../composables/avatarCatalog.js'

const props = defineProps({ room: Object, myToken: String, myPlayerId: String })
const emit = defineEmits(['room-updated'])

// ─── 暂停状态 ─────────────────────────────────────────────────────────────────
const isPaused = computed(() => (props.room?.status || 'active') === 'paused')

// ─── 底部主 tab ───────────────────────────────────────────────────────────────
const activeMainTab = ref('home') // 'home' | 'battle' | 'finance'

// 主页子 tab
const homeTab = ref('transfer') // 'transfer' | 'pay' | 'lottery' | 'deeds'
// 战报子 tab
const battleTab = ref('status') // 'status' | 'logs'
// 金融子 tab
const financeTab = ref('deposit') // 'deposit' | 'loan'

// ─── 转账子选项卡（保留触摸滑动兼容） ──────────────────────────────────────
const activeTransferTab = ref(0)

// 触摸滑动（转账子 tab）
let transferTouchStartX = 0
function onTransferTouchStart(e) { transferTouchStartX = e.touches[0].clientX }
function onTransferTouchEnd(e) {
  const dx = e.changedTouches[0].clientX - transferTouchStartX
  if (Math.abs(dx) < 40) return
  if (dx < 0 && activeTransferTab.value < 1) activeTransferTab.value = 1
  if (dx > 0 && activeTransferTab.value > 0) activeTransferTab.value = 0
}

const me = computed(() => props.room.players.find(p => p.id === props.myPlayerId))
const others = computed(() => props.room.players.filter(p => p.id !== props.myPlayerId))

function playerAvatarId(player, fallback = 1) {
  return normalizeAvatarId(player?.avatar_id, fallback)
}

function playerAvatarSrc(player) {
  if (player?.avatar_url) return player.avatar_url
  return avatarPath(playerAvatarId(player))
}

const nowTick = ref(Date.now())
let lotteryTimer = null

onMounted(() => {
  lotteryTimer = window.setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (lotteryTimer) window.clearInterval(lotteryTimer)
})

const lottery = computed(() => ({
  ticketPrice: 200,
  numberCount: 30,
  drawIntervalMin: 30,
  buyCooldownMs: 2 * 60 * 1000,
  jackpotPool: 0,
  tickets: [],
  lastPurchaseAtByPlayer: {},
  lastResult: null,
  ...(props.room.config?.lottery || {})
}))

const lotteryNumbers = computed(() =>
  Array.from({ length: lottery.value.numberCount }, (_, index) => index + 1)
)
const selectedLotteryNumber = ref(1)
const myLotteryTickets = computed(() =>
  (lottery.value.tickets || []).filter(ticket => ticket.playerId === props.myPlayerId)
)
const soldLotteryNumbers = computed(() =>
  new Set((lottery.value.tickets || []).map(ticket => Number(ticket.number)))
)
const myLotteryNumberSet = computed(() =>
  new Set(myLotteryTickets.value.map(ticket => Number(ticket.number)))
)
const lotteryBankBonusPreview = computed(() =>
  Math.max(0, Math.floor(Math.max(0, Number(props.room.config?.bankBalance || 0)) * 0.1))
)
const lotteryCooldownMs = computed(() => {
  const lastBuyAt = Number(lottery.value.lastPurchaseAtByPlayer?.[props.myPlayerId] || 0)
  if (!lastBuyAt) return 0
  return Math.max(0, lastBuyAt + Number(lottery.value.buyCooldownMs || 0) - nowTick.value)
})
const lotteryCooldownLabel = computed(() => {
  const totalSeconds = Math.ceil(lotteryCooldownMs.value / 1000)
  if (totalSeconds <= 0) return ''
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})
const lotteryCountdownSecs = computed(() => {
  const drawIntervalMs = Number(lottery.value.drawIntervalMin || 30) * 60 * 1000
  const lastDrawAt = Number(lottery.value.lastDrawAt || props.room.createdAt || Date.now())
  const baseNow = isPaused.value ? Number(props.room.config?.pausedAt || nowTick.value) : nowTick.value
  return Math.max(0, Math.ceil((lastDrawAt + drawIntervalMs - baseNow) / 1000))
})
const lotteryCountdownLabel = computed(() => {
  const minutes = Math.floor(lotteryCountdownSecs.value / 60)
  const seconds = lotteryCountdownSecs.value % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})
const canBuyLottery = computed(() =>
  !lotteryCooldownMs.value
  && selectedLotteryNumber.value >= 1
  && selectedLotteryNumber.value <= lottery.value.numberCount
  && !soldLotteryNumbers.value.has(selectedLotteryNumber.value)
)

const showToast = ref(false)
const toastMessage = ref('')
let toastTimer = null

function showTopToast(msg) {
  toastMessage.value = msg
  showToast.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    showToast.value = false
  }, 2500)
}

function onLotteryNumberClick(number) {
  if (soldLotteryNumbers.value.has(number)) {
    const ticket = (lottery.value.tickets || []).find(t => t.number === number)
    if (ticket) {
      const player = props.room.players.find(p => p.id === ticket.playerId)
      if (player) {
        showTopToast(`该号码已被 ${player.name} 买走`)
      } else {
        showTopToast(`该号码已被买走`)
      }
    }
    return
  }
  selectedLotteryNumber.value = number
}

// 获取玩家的资产
function getPlayerProperties(playerId) {
  return (props.room.properties || []).filter(p => p.player_id === playerId)
}

function getPropertyAssetValue(prop) {
  return Number(prop.price || 0) + Number(prop.build_cost || 0)
}

function getBattlePropertyValue(playerId) {
  return (props.room.properties || [])
    .filter(p => p.player_id === playerId)
    .reduce((s, p) => s + getPropertyAssetValue(p), 0)
}

const myPropertyValue = computed(() => getBattlePropertyValue(props.myPlayerId))
const myTotalAssets = computed(() => Number(me.value?.balance || 0) + myPropertyValue.value + myDepositTotal.value - myTotalDebt.value)

// ─── 地产 tab ─────────────────────────────────────────────────────────────────
const myProperties = computed(() => getPlayerProperties(props.myPlayerId))

const rentLabels = ['空地', '1 栋房屋', '2 栋房屋', '3 栋房屋', '4 栋房屋', '酒店']
const rentIcons  = ['🏚️', '🏠', '🏠', '🏠', '🏠', '🏨']
const showDeedOcr = ref(false)
const deedOcrTarget = ref('buy')
const recognizedDeed = ref(null)

function parsedRents(prop) {
  try {
    const r = typeof prop.rents === 'string' ? JSON.parse(prop.rents) : prop.rents
    return Array.from({ length: 6 }, (_, i) => (r?.[i] != null && r[i] !== '' ? Number(r[i]) : null))
  } catch { return Array(6).fill(null) }
}

function buildUnitCostForProperty(prop) {
  const stored = Math.floor(Number(prop?.build_unit_cost));
  if (Number.isFinite(stored) && stored > 0) return stored
  const buildCount = Number(prop?.build_count || 0)
  const buildCost = Number(prop?.build_cost || 0)
  if (buildCount > 0 && buildCost > 0) return Math.floor(buildCost / buildCount)
  return 0
}

function propertyLevelLabel(prop) {
  const buildCount = Number(prop?.build_count || 0)
  if (buildCount <= 0) return '未建房'
  if (buildCount >= 5) return '酒店'
  return `${buildCount} 栋房屋`
}

function currentRentIndex(prop) {
  return Math.min(5, Math.max(0, Number(prop?.build_count || 0)))
}

function currentRent(prop) {
  return parsedRents(prop)[currentRentIndex(prop)]
}

function currentRentLabel(prop) {
  return rentLabels[currentRentIndex(prop)]
}

const deedDetailProp = ref(null)
const showBuildPicker = ref(false)
const showTransferSheet = ref(false)
const showRenameSheet = ref(false)

const isSheetOpen = computed(() => Boolean(showBuildPicker.value || deedDetailProp.value || showTransferSheet.value || showRenameSheet.value))

let previousBodyOverflow = ''
let previousBodyTouchAction = ''

watch(isSheetOpen, open => {
  if (typeof document === 'undefined') return
  const bodyStyle = document.body.style
  if (open) {
    previousBodyOverflow = bodyStyle.overflow
    previousBodyTouchAction = bodyStyle.touchAction
    bodyStyle.overflow = 'hidden'
    bodyStyle.touchAction = 'none'
    return
  }
  bodyStyle.overflow = previousBodyOverflow
  bodyStyle.touchAction = previousBodyTouchAction
})

onBeforeUnmount(() => {
  if (typeof document === 'undefined') return
  const bodyStyle = document.body.style
  bodyStyle.overflow = previousBodyOverflow
  bodyStyle.touchAction = previousBodyTouchAction
})

function openDeedDetail(prop) {
  deedDetailProp.value = prop
  sellStep.value = 'detail'
  sellToPlayerId.value = ''
  sellAmount.value = null
  resetEditDeedForm(prop)
}

function closeDeedDetail() {
  deedDetailProp.value = null
  sellStep.value = 'detail'
  resetEditDeedForm(null)
}

function openBuyDeedOcr() {
  deedOcrTarget.value = 'buy'
  showDeedOcr.value = true
}

function clearRecognizedDeed() {
  recognizedDeed.value = null
}

function openEditDeedOcr() {
  deedOcrTarget.value = 'edit'
  showDeedOcr.value = true
}

// ─── 出售地产 ─────────────────────────────────────────────────────────────────
const sellStep = ref('detail')       // 'detail' | 'edit' | 'bank' | 'player' | 'mortgage' | 'redeem' | 'sell-building'
const sellToPlayerId = ref('')
const sellAmount = ref(null)
const sellLoading = ref(false)
const propertySaleDecisionLoading = ref('')
const editDeedPrice = ref(null)
const editDeedBuildUnitCost = ref(null)
const editDeedBuildCost = ref(null)
const editDeedRents = ref(Array(6).fill(null))
const editDeedLoading = ref(false)
const editDeedName = ref('')

const pendingPropertySales = computed(() => Array.isArray(props.room.config?.pendingPropertySales) ? props.room.config.pendingPropertySales : [])
const incomingPropertySales = computed(() => pendingPropertySales.value.filter(sale => sale.buyerId === props.myPlayerId))

function playerNameById(playerId) {
  return props.room.players.find(p => p.id === playerId)?.name || '玩家'
}

function hasPendingSaleForCurrentProperty() {
  const propId = deedDetailProp.value?.id
  if (!propId) return false
  return pendingPropertySales.value.some(sale => sale.propertyId === propId)
}

function resetEditDeedForm(prop) {
  if (!prop) {
    editDeedPrice.value = null
    editDeedBuildUnitCost.value = null
    editDeedBuildCost.value = null
    editDeedRents.value = Array(6).fill(null)
    editDeedLoading.value = false
    editDeedName.value = ''
    return
  }
  editDeedName.value = String(prop.name || '')
  editDeedPrice.value = Number(prop.price || 0)
  editDeedBuildUnitCost.value = buildUnitCostForProperty(prop)
  editDeedBuildCost.value = Number(prop.build_cost || 0)
  editDeedRents.value = parsedRents(prop).map(v => (v == null ? 0 : Number(v)))
  editDeedLoading.value = false
}

function startEditDeed() {
  if (!deedDetailProp.value) return
  resetEditDeedForm(deedDetailProp.value)
  sellStep.value = 'edit'
}

function normalizeWholeAmount(value) {
  const normalized = Math.floor(Number(value))
  return Number.isFinite(normalized) ? normalized : NaN
}

function normalizedRents(values, fallback = 0) {
  return Array.from({ length: 6 }, (_, i) => {
    const normalized = normalizeWholeAmount(values?.[i])
    return Number.isFinite(normalized) ? normalized : fallback
  })
}

async function submitEditDeed() {
  if (editDeedLoading.value || !deedDetailProp.value) return
  const name = editDeedName.value.trim()

  const price = normalizeWholeAmount(editDeedPrice.value)
  const buildUnitCost = normalizeWholeAmount(editDeedBuildUnitCost.value)
  const buildCost = normalizeWholeAmount(editDeedBuildCost.value)
  const rents = editDeedRents.value.map(normalizeWholeAmount)

  if (!name) return alert('请输入地产名称')
  if (price < 0 || buildUnitCost < 0 || buildCost < 0 || !Number.isFinite(price) || !Number.isFinite(buildUnitCost) || !Number.isFinite(buildCost)) {
    return alert('请输入正确的购入价格、每层加盖费用和累计加盖金额')
  }
  if (rents.length !== 6 || rents.some(v => v < 0 || !Number.isFinite(v))) {
    return alert('请填写 6 档非负整数过路费')
  }

  editDeedLoading.value = true
  try {
    const propId = deedDetailProp.value.id
    const res = await apiWithToken(`/api/rooms/${props.room.id}/action`, props.myToken, {
      method: 'POST',
      body: { type: 'update-property', propertyId: propId, name, price, buildUnitCost, buildCost, rents }
    })
    const updatedProp = (res.room.properties || []).find(p => p.id === propId) || null
    deedDetailProp.value = updatedProp
    sellStep.value = 'detail'
    if (updatedProp) resetEditDeedForm(updatedProp)
    emit('room-updated', res.room)
  } catch (e) {
    alert('保存失败：' + e.message)
  } finally {
    editDeedLoading.value = false
  }
}

const sellQuickAmounts = computed(() => {
  if (!deedDetailProp.value) return [50, 100, 200, 500, 1000]
  const half = Math.floor(deedDetailProp.value.price / 2)
  const full = deedDetailProp.value.price
  const base = [half, full]
  return [...new Set([...base, 50, 100, 200, 500, 1000])].sort((a, b) => a - b).slice(0, 6)
})

function startSell(target) {
  sellStep.value = target
  sellToPlayerId.value = ''
  sellAmount.value = target === 'bank' ? Math.floor(deedDetailProp.value.price / 2) : null
}

async function submitSell() {
  if (sellLoading.value) return
  const prop = deedDetailProp.value
  const amount = Number(sellAmount.value)
  if (!(amount > 0)) return alert('请输入正确金额')
  if (sellStep.value === 'player' && !sellToPlayerId.value) return alert('请选择买家')
  if (sellStep.value === 'player' && hasPendingSaleForCurrentProperty()) return alert('这处地产已有待确认报价')
  sellLoading.value = true
  try {
    const body = {
      type: 'sell-property',
      propertyId: prop.id,
      amount,
      toPlayerId: sellStep.value === 'player' ? sellToPlayerId.value : null
    }
    const res = await apiWithToken(`/api/rooms/${props.room.id}/action`, props.myToken, {
      method: 'POST',
      body
    })
    deedDetailProp.value = null
    sellStep.value = 'detail'
    emit('room-updated', res.room)
    if (body.toPlayerId) alert('报价已发送，等待买家确认')
  } catch (e) {
    alert('出售失败：' + e.message)
  } finally {
    sellLoading.value = false
  }
}

async function respondPropertySale(sale, accept) {
  if (propertySaleDecisionLoading.value) return
  propertySaleDecisionLoading.value = sale.id
  try {
    const res = await apiWithToken(`/api/rooms/${props.room.id}/action`, props.myToken, {
      method: 'POST',
      body: { type: 'respond-property-sale', saleId: sale.id, accept }
    })
    emit('room-updated', res.room)
  } catch (e) {
    alert((accept ? '接受失败：' : '拒绝失败：') + e.message)
  } finally {
    propertySaleDecisionLoading.value = ''
  }
}

const toPlayerId = ref('')
const transferAmount = ref(null)
const fineAmount = ref(null)

const transferReason = ref('manual')

const transferGridColumns = computed(() => {
  const count = others.value.length;
  // If there are exactly 2 or 4 other players, make it a 2-column grid.
  if (count === 2 || count === 4) {
    return 'repeat(2, 1fr)';
  }
  // Otherwise, default to a 3-column grid (handles 3, 5, 6, etc).
  return 'repeat(3, 1fr)';
})

const transferProperties = computed(() => {
  if (!toPlayerId.value) return []
  return getPlayerProperties(toPlayerId.value)
})

function selectTransferReason(reason, rentAmount = 0) {
  transferReason.value = reason
  if (reason !== 'manual') {
    transferAmount.value = Number(rentAmount) || 0
  }
}

// ─── 抵押 / 赎回 ──────────────────────────────────────────────────────────────
const mortgageLoading = ref(false)

function redeemCost(prop) {
  const principal = Math.floor(prop.price / 2)
  return principal + Math.floor(principal * 0.1)
}

async function submitMortgage() {
  if (mortgageLoading.value) return
  const prop = deedDetailProp.value
  mortgageLoading.value = true
  try {
    const res = await apiWithToken(`/api/rooms/${props.room.id}/action`, props.myToken, {
      method: 'POST',
      body: { type: 'mortgage', propertyId: prop.id }
    })
    deedDetailProp.value = null
    sellStep.value = 'detail'
    emit('room-updated', res.room)
  } catch (e) {
    alert('抵押失败：' + e.message)
  } finally {
    mortgageLoading.value = false
  }
}

async function submitRedeem() {
  if (mortgageLoading.value) return
  const prop = deedDetailProp.value
  mortgageLoading.value = true
  try {
    const res = await apiWithToken(`/api/rooms/${props.room.id}/action`, props.myToken, {
      method: 'POST',
      body: { type: 'redeem', propertyId: prop.id }
    })
    deedDetailProp.value = null
    sellStep.value = 'detail'
    emit('room-updated', res.room)
  } catch (e) {
    alert('赎回失败：' + e.message)
  } finally {
    mortgageLoading.value = false
  }
}

// ─── 出售房产（逐级卖回银行） ──────────────────────────────────────────────────
const sellBuildingCount = ref(1)
const sellBuildingLoading = ref(false)

const sellBuildingMaxCount = computed(() => {
  if (!deedDetailProp.value) return 0
  return Math.max(0, Number(deedDetailProp.value.build_count || 0))
})

const sellBuildingCountOptions = computed(() =>
  Array.from({ length: sellBuildingMaxCount.value }, (_, i) => i + 1)
)

const sellBuildingUnitCost = computed(() => {
  if (!deedDetailProp.value) return 0
  const bc = Number(deedDetailProp.value.build_count || 0)
  const cost = Number(deedDetailProp.value.build_cost || 0)
  if (bc <= 0) return 0
  return Math.floor(cost / bc)
})

const sellBuildingRefund = computed(() => sellBuildingUnitCost.value * sellBuildingCount.value)

function startSellBuilding() {
  sellBuildingCount.value = 1
  sellStep.value = 'sell-building'
}

async function submitSellBuilding() {
  if (sellBuildingLoading.value) return
  const prop = deedDetailProp.value
  sellBuildingLoading.value = true
  try {
    const res = await apiWithToken(`/api/rooms/${props.room.id}/action`, props.myToken, {
      method: 'POST',
      body: { type: 'sell-building', propertyId: prop.id, sellCount: sellBuildingCount.value }
    })
    deedDetailProp.value = null
    sellStep.value = 'detail'
    emit('room-updated', res.room)
  } catch (e) {
    alert('出售房产失败：' + e.message)
  } finally {
    sellBuildingLoading.value = false
  }
}

// ─── 缴款类型 ──────────────────────────────────────────────────────────────────
const payTypes = [
  { value: 'buy-land',  icon: '🏠', label: '买地' },
  { value: 'build',     icon: '🏗️', label: '建房' },
  { value: 'fine',      icon: '💸', label: '交罚款' },
]
const fineType = ref('fine')
const buildTargetProp = ref(null)
const buildCount = ref(1)

function selectPayType(type) {
  fineType.value = type
  fineAmount.value = null
  buildCount.value = 1
  if (type !== 'build') buildTargetProp.value = null
}

function selectBuildProp(prop) {
  buildTargetProp.value = prop
  buildCount.value = 1
  syncBuildAmount()
}

const buildUnitCost = computed(() => {
  if (!buildTargetProp.value) return 0
  return buildUnitCostForProperty(buildTargetProp.value)
})

const buildMaxCount = computed(() => {
  if (!buildTargetProp.value) return 0
  return Math.max(0, 5 - Number(buildTargetProp.value.build_count || 0))
})

const buildCountOptions = computed(() =>
  Array.from({ length: buildMaxCount.value }, (_, i) => i + 1)
)

const buildTargetPropLevelLabel = computed(() =>
  buildTargetProp.value ? propertyLevelLabel(buildTargetProp.value) : ''
)

const buildTotalCost = computed(() => buildUnitCost.value * buildCount.value)

function syncBuildAmount() {
  if (buildMaxCount.value <= 0) {
    fineAmount.value = null
    return
  }
  if (buildCount.value > buildMaxCount.value) buildCount.value = buildMaxCount.value
  if (buildUnitCost.value > 0) fineAmount.value = buildUnitCost.value * buildCount.value
}

function setBuildCount(count) {
  buildCount.value = count
  syncBuildAmount()
}

// 获取建房参考金额列表（rents[1..5] 去掉 null）
function getBuildRentHints(prop) {
  const unit = buildUnitCostForProperty(prop)
  const current = currentRent(prop)
  return [
    unit > 0 ? `每层 ¥${fmt(unit)}` : null,
    current != null ? `${currentRentLabel(prop)} ¥${fmt(current)}` : null
  ].filter(Boolean)
}

// 建房快捷金额（根据选中地块的 rents 推断）
const buildQuickAmounts = computed(() => {
  if (!buildTargetProp.value) return DEFAULT_QUICK
  const amounts = buildCountOptions.value
    .map(count => buildUnitCost.value * count)
    .filter(v => v > 0)
  if (!amounts.length) return DEFAULT_QUICK
  return [...new Set([...amounts, ...DEFAULT_QUICK])].sort((a, b) => a - b).slice(0, 6)
})

function onDeedConfirmed(deed) {
  if (deedOcrTarget.value === 'edit') {
    editDeedName.value = deed.name?.trim?.() || editDeedName.value
    editDeedPrice.value = deed.price ?? editDeedPrice.value
    editDeedBuildUnitCost.value = deed.buildUnitCost ?? editDeedBuildUnitCost.value
    editDeedRents.value = Array.from({ length: 6 }, (_, i) => deed.rents?.[i] ?? editDeedRents.value[i] ?? null)
  } else {
    recognizedDeed.value = deed
    if (deed.price != null) fineAmount.value = deed.price
    fineType.value = 'buy-land'
  }
  showDeedOcr.value = false
}

// ─── 改名 ─────────────────────────────────────────────────────────────────────
const renameInput = ref('')
const renameInputRef = ref(null)
const renameAvatarId = ref(1)
const renamePreviewAvatarSrc = computed(() => avatarPath(renameAvatarId.value))

async function startEditName() {
  renameInput.value = me.value?.name || ''
  renameAvatarId.value = playerAvatarId(me.value)
  showRenameSheet.value = true
  nextTick(() => {
    renameInputRef.value?.focus()
  })
}

async function submitRenameSheet() {
  const currentName = me.value?.name || ''
  const currentAvatarId = playerAvatarId(me.value)
  const trimmed = renameInput.value.trim()
  if (!trimmed) {
    alert('名字不能为空')
    return
  }
  if (trimmed === currentName && renameAvatarId.value === currentAvatarId) {
    showRenameSheet.value = false
    return
  }
  
  try {
    const res = await apiWithToken(`/api/rooms/${props.room.id}/rename`, props.myToken, {
      method: 'POST',
      body: { playerId: props.myPlayerId, name: trimmed, avatarId: renameAvatarId.value }
    })
    showRenameSheet.value = false
    emit('room-updated', res.room)
  } catch (e) {
    alert('改名失败：' + e.message)
  }
}

// ─── 向银行缴款的金额偏好缓存（localStorage） ────────────────────────────────
const FINE_HISTORY_KEY = 'monopoly_fine_history'
const MAX_HISTORY = 20
const MAX_FAVORITES = 3
const DEFAULT_QUICK = [50, 100, 200, 500, 1000]

function loadFineHistory() {
  try {
    return JSON.parse(localStorage.getItem(FINE_HISTORY_KEY) || '[]')
  } catch { return [] }
}

function saveFineHistory(history) {
  localStorage.setItem(FINE_HISTORY_KEY, JSON.stringify(history))
}

function recordFineAmount(amount) {
  const history = loadFineHistory()
  history.push(amount)
  saveFineHistory(history.slice(-MAX_HISTORY))
  refreshFavorites()
}

function calcFavorites() {
  const history = loadFineHistory()
  if (!history.length) return []
  const freq = {}
  for (const v of history) freq[v] = (freq[v] || 0) + 1
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([v]) => Number(v))
    .filter(v => !DEFAULT_QUICK.includes(v))
    .slice(0, MAX_FAVORITES)
}

const favoriteAmounts = ref(calcFavorites())

const fineQuickAmounts = computed(() => {
  if (fineType.value === 'build') return buildQuickAmounts.value
  const favs = favoriteAmounts.value
  return [...favs, ...DEFAULT_QUICK.filter(v => !favs.includes(v))]
})

function refreshFavorites() {
  favoriteAmounts.value = calcFavorites()
}

// ─── 转账 ─────────────────────────────────────────────────────────────────────
async function submitTransfer() {
  if (!(transferAmount.value > 0)) return alert('请输入正确金额')
  if (!toPlayerId.value) return alert('请选择收款人')
  try {
    const res = await apiWithToken(`/api/rooms/${props.room.id}/action`, props.myToken, {
      method: 'POST',
      body: { type: 'transfer', fromPlayerId: props.myPlayerId, toPlayerId: toPlayerId.value, amount: transferAmount.value }
    })
    transferAmount.value = null
    emit('room-updated', res.room)
  } catch (e) { alert('转账失败：' + e.message) }
}

async function submitLotteryPurchase() {
  if (!canBuyLottery.value) return
  try {
    const res = await apiWithToken(`/api/rooms/${props.room.id}/action`, props.myToken, {
      method: 'POST',
      body: { type: 'buy-lottery', number: selectedLotteryNumber.value }
    })
    emit('room-updated', res.room)
  } catch (e) {
    alert('购票失败：' + e.message)
  }
}

async function submitFine() {
  if (!(fineAmount.value > 0)) return alert('请输入正确金额')
  if (fineType.value === 'build' && !buildTargetProp.value) return alert('请选择建房地块')
  if (fineType.value === 'build' && buildMaxCount.value <= 0) return alert('该地产已经建满')
  const typeLabel = payTypes.find(t => t.value === fineType.value)?.label || '缴款'
  const buildNote = fineType.value === 'build' && buildTargetProp.value
    ? `${buildTargetProp.value.name} · ${buildCount.value} 栋`
    : ''
  const confirmMsg = buildNote
    ? `确认向银行【${typeLabel}】缴款 ¥${fineAmount.value}（${buildNote}）？`
    : `确认向银行【${typeLabel}】缴款 ¥${fineAmount.value}？`
  if (!confirm(confirmMsg)) return
  const noteText = [typeLabel, buildNote].filter(Boolean).join(' · ')
  try {
    if (fineType.value === 'buy-land') {
      const propertyPrice = normalizeWholeAmount(recognizedDeed.value?.price ?? fineAmount.value)
      const property = recognizedDeed.value
        ? {
            name: recognizedDeed.value.name?.trim?.() || '',
            price: propertyPrice,
            buildUnitCost: normalizeWholeAmount(recognizedDeed.value.buildUnitCost ?? 0),
            rents: normalizedRents(recognizedDeed.value.rents, 0)
          }
        : null
      if (propertyPrice < 0 || !Number.isFinite(propertyPrice)) return alert('请输入正确金额')

      const res = await apiWithToken(`/api/rooms/${props.room.id}/action`, props.myToken, {
        method: 'POST',
        body: {
          type: 'buy-property',
          amount: fineAmount.value,
          note: noteText,
          property
        }
      })
      recordFineAmount(fineAmount.value)
      recognizedDeed.value = null
      fineAmount.value = null
      emit('room-updated', res.room)
    } else if (fineType.value === 'build' && buildTargetProp.value) {
      const res = await apiWithToken(`/api/rooms/${props.room.id}/action`, props.myToken, {
        method: 'POST',
        body: {
          type: 'build-property',
          propertyId: buildTargetProp.value.id,
          buildCount: buildCount.value,
          amount: fineAmount.value,
          note: noteText
        }
      })
      recordFineAmount(fineAmount.value)
      fineAmount.value = null
      buildTargetProp.value = null
      buildCount.value = 1
      emit('room-updated', res.room)
    } else {
      const res = await apiWithToken(`/api/rooms/${props.room.id}/action`, props.myToken, {
        method: 'POST',
        body: { type: 'pay-fine', amount: fineAmount.value, note: noteText }
      })
      recordFineAmount(fineAmount.value)
      fineAmount.value = null
      if (fineType.value === 'build') buildTargetProp.value = null
      emit('room-updated', res.room)
    }
  } catch (e) { alert('操作失败：' + e.message) }
}

// ─── 存款 ─────────────────────────────────────────────────────────────────────
const depositAmount = ref(null)
const depositLoading = ref(false)

const myDeposits = computed(() =>
  (props.room.deposits || []).filter(d => d.player_id === props.myPlayerId && d.status === 'active')
)
const myDepositTotal = computed(() => myDeposits.value.reduce((s, d) => s + Number(d.amount || 0), 0))

const myLoans = computed(() =>
  (props.room.loans || []).filter(l => l.player_id === props.myPlayerId && l.status === 'active')
)
const myTotalDebt = computed(() =>
  myLoans.value.reduce((s, l) => s + l.remaining, 0)
)

function fmtTime(ts) {
  const d = new Date(ts)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function submitDeposit() {
  if (!(depositAmount.value > 0)) return alert('请输入存款金额')
  if (depositAmount.value > (me.value?.balance || 0)) return alert('余额不足')
  depositLoading.value = true
  try {
    const res = await apiWithToken(`/api/rooms/${props.room.id}/deposit`, props.myToken, {
      method: 'POST',
      body: { amount: depositAmount.value }
    })
    emit('room-updated', res.room)
    depositAmount.value = null
  } catch (e) { alert('存款失败：' + e.message) }
  finally { depositLoading.value = false }
}

async function submitWithdraw(dep) {
  if (!confirm(`确认取出存款 ¥${fmt(dep.amount)}？`)) return
  try {
    const res = await apiWithToken(`/api/rooms/${props.room.id}/withdraw`, props.myToken, {
      method: 'POST',
      body: { depositId: dep.id }
    })
    emit('room-updated', res.room)
  } catch (e) { alert('取款失败：' + e.message) }
}

// ─── 贷款 ─────────────────────────────────────────────────────────────────────
const loanAmount = ref(null)
const loanLoading = ref(false)
const repayAmounts = ref({})

const myAvailableCredit = computed(() => {
  const maxLoan = Math.floor(myTotalAssets.value / 2)
  return Math.max(0, maxLoan - myTotalDebt.value)
})
const fixedLoanRate = computed(() => Math.round(Number(props.room.config.interestRate ?? 1.5) * 3 * 10) / 10)

async function submitLoan() {
  if (!(loanAmount.value > 0)) return alert('请输入贷款金额')
  if (loanAmount.value > myAvailableCredit.value) return alert(`贷款金额超出可贷额度 ¥${fmt(myAvailableCredit.value)}`)
  loanLoading.value = true
  try {
    const res = await apiWithToken(`/api/rooms/${props.room.id}/loan`, props.myToken, {
      method: 'POST',
      body: { amount: loanAmount.value }
    })
    emit('room-updated', res.room)
    alert(`贷款成功！固定利率：${res.loanRate}%`)
    loanAmount.value = null
  } catch (e) { alert('贷款失败：' + (e.code === 'exceeds_credit_limit' ? '超出可贷额度' : e.message)) }
  finally { loanLoading.value = false }
}

async function submitRepay(loan) {
  let amount = Number(repayAmounts.value[loan.id])
  if (!(amount > 0)) return alert('请输入还款金额')
  const balance = me.value?.balance || 0
  if (balance <= 0) return alert('余额不足')
  // 将还款金额限制在余额和剩余贷款的较小值
  amount = Math.min(amount, balance, loan.remaining)
  if (!(amount > 0)) return alert('余额不足，无法还款')
  try {
    const res = await apiWithToken(`/api/rooms/${props.room.id}/repay`, props.myToken, {
      method: 'POST',
      body: { loanId: loan.id, amount }
    })
    emit('room-updated', res.room)
    repayAmounts.value[loan.id] = null
  } catch (e) { alert('还款失败：' + e.message) }
}</script>

<style scoped>
/* ── 转账玩家网格 ── */
.transfer-player-grid {
  display: grid;
  gap: 12px;
  margin-bottom: 8px;
}

.transfer-player-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 8px;
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 12px;
  cursor: pointer;
  transition: all .15s ease;
  -webkit-tap-highlight-color: transparent;
}

.transfer-player-item:active {
  transform: scale(0.95);
  background: rgba(124,58,237,.15);
  border-color: rgba(124,58,237,.6);
}

.transfer-player-avatar {
  width: 40px;
  height: 40px;
  border-radius: 20px;
  object-fit: cover;
  box-shadow: 0 2px 8px rgba(0,0,0,.2);
}

.role-profile-btn {
  border: 0;
  cursor: pointer;
  background: transparent;
}

.role-player-avatar {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  object-fit: cover;
  box-shadow: 0 2px 8px rgba(0, 0, 0, .2);
}

.player-status-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.battle-player-avatar {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  object-fit: cover;
  box-shadow: 0 6px 18px rgba(15, 23, 42, .18);
  flex-shrink: 0;
}

.rename-sheet-body {
  padding: 24px 20px;
}

.rename-profile-preview {
  display: flex;
  align-items: center;
  gap: 14px;
}

.rename-current-avatar {
  width: 68px;
  height: 68px;
  border-radius: 20px;
  object-fit: cover;
  box-shadow: 0 10px 26px rgba(15, 23, 42, .3);
}

.rename-preview-title {
  font-size: 16px;
  font-weight: 700;
  color: #f8fafc;
}

.rename-preview-sub {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.5;
  color: #94a3b8;
}

.avatar-picker-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.avatar-picker-btn {
  padding: 8px 6px 10px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.04);
  color: #cbd5e1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  transition: .18s ease;
}

.avatar-picker-btn.active {
  border-color: rgba(96, 165, 250, .7);
  background: rgba(59, 130, 246, .16);
  color: #eff6ff;
  box-shadow: 0 10px 22px rgba(37, 99, 235, .2);
}

.avatar-picker-img {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 14px;
  object-fit: cover;
  background: rgba(255,255,255,.08);
}

.transfer-player-name {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

.sub-tab-bar {
  display: flex;
  gap: 0;
  margin-bottom: 14px;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 14px;
  padding: 4px;
}
.sub-tab-btn {
  flex: 1;
  padding: 9px 4px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  color: #a7b0cf;
  background: transparent;
  border: 0;
  transition: .2s ease;
  white-space: nowrap;
}
.sub-tab-btn.active {
  background: linear-gradient(135deg, var(--accent), #5b21b6);
  color: white;
  box-shadow: 0 2px 12px rgba(124,58,237,.4);
}
.sub-tab-btn:hover:not(.active) {
  color: #e2e8f0;
  transform: none;
}

/* ── 底部 tabbar ── */
.bottom-tabbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  display: flex;
  align-items: stretch;
  background: rgba(8, 16, 31, 0.92);
  border-top: 1px solid rgba(255,255,255,.10);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 100;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.tabbar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: transparent;
  border: 0;
  border-radius: 0;
  color: rgba(167,176,207,.55);
  font-size: 11px;
  font-weight: 600;
  padding: 8px 0;
  transition: color .18s ease;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.tabbar-item:hover {
  transform: none;
  color: rgba(167,176,207,.8);
}

.tabbar-item.active {
  color: #a78bfa;
}

.tabbar-item.active .tabbar-icon {
  stroke: #a78bfa;
  filter: drop-shadow(0 0 6px rgba(124,58,237,.6));
}

.tabbar-icon {
  width: 22px;
  height: 22px;
  stroke: currentColor;
  transition: stroke .18s ease, filter .18s ease;
}

/* ── 缴款类型选择 ── */
.lottery-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.lottery-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.lottery-countdown {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}

.lottery-countdown-label {
  font-size: 12px;
  color: #94a3b8;
}

.lottery-countdown strong {
  font-size: 24px;
  color: #f8fafc;
}

.lottery-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.lottery-stat {
  padding: 12px;
  border-radius: 14px;
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.08);
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #a7b0cf;
  font-size: 12px;
}

.lottery-stat strong {
  color: #f8fafc;
  font-size: 18px;
}

.lottery-ticket-summary,
.lottery-actions-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.lottery-hint,
.lottery-ticket-summary {
  color: #a7b0cf;
  font-size: 13px;
}

.lottery-my-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lottery-my-list-label {
  font-size: 12px;
  color: #94a3b8;
}

.lottery-my-list-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.lottery-my-chip {
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(124,58,237,.18);
  border: 1px solid rgba(167,139,250,.35);
  color: #ede9fe;
  font-size: 12px;
  font-weight: 700;
}

.lottery-number-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

.lottery-number-btn {
  border: 1px solid rgba(255,255,255,.1);
  background: rgba(255,255,255,.05);
  color: #e2e8f0;
  border-radius: 12px;
  min-height: 42px;
  font-weight: 700;
  position: relative;
}

.lottery-number-btn.active,
.lottery-number-btn.mine {
  background: linear-gradient(135deg, #7c3aed, #4f46e5);
  border-color: rgba(167,139,250,.8);
  color: #fff;
}

.lottery-number-btn.sold {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.25);
  color: #ef4444;
  cursor: pointer;
}

.lottery-number-btn:disabled {
  opacity: 1;
  cursor: not-allowed;
}

.lottery-buy-btn {
  min-width: 140px;
}

.lottery-buy-btn:disabled {
  background: rgba(124, 58, 237, 0.15) !important;
  color: rgba(255, 255, 255, 0.4) !important;
  border-color: rgba(124, 58, 237, 0.3) !important;
  box-shadow: none !important;
}

.lottery-last-result {
  padding: 14px;
  border-radius: 16px;
  background: rgba(124,58,237,.12);
  border: 1px solid rgba(124,58,237,.25);
}

.lottery-last-title {
  color: #c4b5fd;
  font-size: 12px;
}

.lottery-last-main {
  margin-top: 4px;
  font-size: 26px;
  font-weight: 800;
  color: #f8fafc;
}

.lottery-last-meta {
  margin-top: 6px;
  color: #ddd6fe;
  font-size: 13px;
}

@media (max-width: 640px) {
  .lottery-stats {
    grid-template-columns: 1fr;
  }

  .lottery-head {
    flex-direction: column;
  }

  .lottery-countdown {
    align-items: flex-start;
  }

  .lottery-number-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

.pay-type-group {
  display: flex;
  gap: 8px;
}
.pay-type-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 10px 4px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  color: #a7b0cf;
  background: rgba(255,255,255,.06);
  border: 1.5px solid rgba(255,255,255,.1);
  cursor: pointer;
  transition: all .18s ease;
  -webkit-tap-highlight-color: transparent;
}
.pay-type-btn:hover {
  background: rgba(124,58,237,.12);
  border-color: rgba(124,58,237,.3);
  color: #c4b5fd;
  transform: none;
}
.pay-type-btn.active {
  background: rgba(124,58,237,.22);
  border-color: rgba(124,58,237,.6);
  color: #ede9fe;
  box-shadow: 0 2px 10px rgba(124,58,237,.25);
}
.pay-type-icon {
  font-size: 22px;
  line-height: 1;
}

/* ── 地契扫描入口 ── */
.deed-entry {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.deed-scan-row {
  display: flex;
  gap: 10px;
  align-items: stretch;
}
.deed-scan-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 13px 0;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  color: #a78bfa;
  background: rgba(124,58,237,.1);
  border: 1.5px dashed rgba(124,58,237,.5);
  cursor: pointer;
  transition: background .18s, border-color .18s;
  -webkit-tap-highlight-color: transparent;
}
.deed-scan-row .deed-scan-btn {
  flex: 1;
}
.deed-scan-btn:hover {
  background: rgba(124,58,237,.2);
  border-color: rgba(124,58,237,.8);
}
.deed-scan-btn:active {
  transform: scale(.97);
}
.deed-scan-icon {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  flex-shrink: 0;
}
.deed-clear-btn {
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid rgba(148,163,184,.28);
  background: rgba(51,65,85,.55);
  color: #cbd5e1;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.deed-manual-card {
  margin-top: 6px;
}

/* ── 其他 ── */
.name-clickable {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
}
.name-clickable:hover {
  color: #94a3b8;
}
.edit-icon {
  font-size: 12px;
  opacity: 0.6;
}
.name-input {
  background: rgba(30,41,59,.8);
  border: 1px solid rgba(100,116,139,.5);
  color: #e2e8f0;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 14px;
  width: 120px;
  text-align: center;
}

/* 我的余额卡片总资产行 */
.my-assets-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 6px;
}

.my-assets-label {
  font-size: 12px;
  color: #a7b0cf;
  font-weight: 600;
}

.my-assets-val {
  font-size: 15px;
  font-weight: 800;
  color: #a78bfa;
}

.my-assets-breakdown {
  font-size: 11px;
  color: #6d5fb5;
}

/* 战况页总资产行 */
.battle-assets-row {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 2px 0 8px;
}

.battle-assets-label {
  font-size: 11px;
  color: #a7b0cf;
  font-weight: 600;
}

.battle-assets-val {
  font-size: 13px;
  font-weight: 700;
  color: #a78bfa;
}

.battle-assets-breakdown {
  font-size: 11px;
  color: #6d5fb5;
}

/* 玩家资产 */
.player-properties {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255,255,255,.08);
}
.properties-label {
  font-size: 12px;
  color: #a78bfa;
  font-weight: 600;
  margin-bottom: 6px;
}
.properties-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.property-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  background: rgba(124,58,237,.1);
  border-radius: 6px;
  font-size: 13px;
}
.property-name {
  color: #e2e8f0;
  font-weight: 500;
}
.property-price {
  color: #a78bfa;
  font-weight: 600;
}

/* ── 地产 tab ── */
.deeds-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 36px 0 20px;
}
.deeds-empty-icon {
  width: 64px;
  height: 64px;
  color: #475569;
}
.deeds-empty-tip {
  font-size: 14px;
  color: #475569;
  text-align: center;
  line-height: 1.6;
  margin: 0;
}

.deeds-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
}

.deed-card-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: rgba(124,58,237,.08);
  border: 1px solid rgba(124,58,237,.22);
  border-radius: 14px;
  padding: 14px 16px;
  cursor: pointer;
  transition: background .15s, border-color .15s;
  -webkit-tap-highlight-color: transparent;
}
.deed-card-item:active {
  background: rgba(124,58,237,.18);
  transform: scale(.98);
}

.deed-card-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.deed-card-name {
  font-size: 16px;
  font-weight: 700;
  color: #ede9fe;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.deed-card-price {
  font-size: 12px;
  color: #7c6faa;
}

.deed-card-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.deed-card-rent-preview {
  font-size: 12px;
  color: #a78bfa;
  font-weight: 600;
}
.deed-card-chevron {
  width: 16px;
  height: 16px;
  color: #6d5fb5;
  flex-shrink: 0;
}

.deeds-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 4px 0;
  border-top: 1px solid rgba(255,255,255,.08);
  font-size: 13px;
  color: #7c6faa;
}
.deeds-total-val {
  font-size: 14px;
  font-weight: 700;
  color: #a78bfa;
}

/* ── 地产详情弹窗（底部 sheet） ── */
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0,0,0,.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overscroll-behavior: contain;
}

.sheet {
  width: 100%;
  max-width: 480px;
  max-height: 92vh;
  background: linear-gradient(160deg, #0f172a 0%, #1a1040 100%);
  border-top: 1px solid rgba(255,255,255,.12);
  border-radius: 24px 24px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid rgba(255,255,255,.08);
  flex-shrink: 0;
}
.sheet-title {
  font-size: 18px;
  font-weight: 800;
  color: #ede9fe;
}
.sheet-close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(255,255,255,.08);
  border: 0;
  color: #94a3b8;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.sheet-close:hover { background: rgba(255,255,255,.16); }

.sheet-body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 20px 20px 40px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 0;
}
.sheet-body > * {
  flex-shrink: 0;
}

.sd-info-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sd-price-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 14px;
  padding: 14px 18px;
}
.sd-price-label {
  font-size: 14px;
  color: #94a3b8;
  font-weight: 600;
}
.sd-price-val {
  font-size: 22px;
  font-weight: 900;
  color: #a78bfa;
  letter-spacing: -.02em;
}

.sd-rents-title {
  font-size: 13px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.sd-rents-table {
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 16px;
  overflow: hidden;
}

.sd-rent-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 16px;
  border-bottom: 1px solid rgba(255,255,255,.05);
  transition: background .12s;
}
.sd-rent-row:last-child { border-bottom: none; }
.sd-rent-row--highlight {
  background: rgba(124,58,237,.1);
}

.sd-rent-level {
  display: flex;
  align-items: center;
  gap: 10px;
}
.sd-rent-icon {
  font-size: 18px;
  line-height: 1;
  width: 24px;
  text-align: center;
}
.sd-rent-label-text {
  font-size: 14px;
  font-weight: 600;
  color: #cbd5e1;
}

.sd-rent-amount {
  font-size: 16px;
  font-weight: 700;
  color: #e2e8f0;
}
.sd-rent-amount--hotel {
  color: #a78bfa;
  font-size: 18px;
}

.sd-actions-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sd-sell-building-row {
  padding-top: 0;
}

.sd-edit-btn {
  width: 100%;
  border: 1px solid rgba(96,165,250,.32);
  background: rgba(59,130,246,.12);
  color: #bfdbfe;
  border-radius: 14px;
  padding: 14px 16px;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: background .15s, transform .1s;
  -webkit-tap-highlight-color: transparent;
}
.sd-edit-btn:hover { background: rgba(59,130,246,.18); }
.sd-edit-btn:active { transform: scale(.98); }
.sd-edit-ocr-btn {
  color: #c4b5fd;
}

.sd-edit-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.sd-edit-title {
  font-size: 18px;
  font-weight: 900;
  color: #e2e8f0;
}
.sd-edit-subtitle {
  margin-top: -6px;
  font-size: 13px;
  line-height: 1.5;
  color: #94a3b8;
}
.sd-edit-field,
.sd-edit-rent-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,.1);
  background: rgba(255,255,255,.04);
}
.sd-edit-label,
.sd-edit-rent-label,
.sd-edit-section-title {
  font-size: 14px;
  font-weight: 700;
  color: #cbd5e1;
}
.sd-edit-rents {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sd-edit-section-title {
  color: #94a3b8;
  letter-spacing: .04em;
}
.sd-edit-input {
  width: 132px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,.15);
  background: rgba(255,255,255,.07);
  color: #eef2ff;
  font-size: 14px;
  font-weight: 700;
  outline: none;
  text-align: right;
}
.sd-edit-input:focus {
  border-color: rgba(124,58,237,.5);
  background: rgba(124,58,237,.08);
}
.sd-edit-input--rent {
  width: 120px;
}
.sd-edit-input--text {
  width: 160px;
  text-align: left;
}

/* ── Sheet 过渡动画 ── */
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity .22s ease;
}
.sheet-enter-active .sheet,
.sheet-leave-active .sheet {
  transition: transform .28s cubic-bezier(.34,1.2,.64,1);
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from .sheet {
  transform: translateY(100%);
}
.sheet-leave-to .sheet {
  transform: translateY(100%);
}

/* ── 出售按钮行 ── */
.sd-sell-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding-top: 4px;
}

.sd-sell-bank-btn,
.sd-sell-player-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 14px;
  border-radius: 14px;
  cursor: pointer;
  border: 1.5px solid;
  transition: background .15s, transform .1s;
  -webkit-tap-highlight-color: transparent;
  text-align: left;
}
.sd-sell-bank-btn:active,
.sd-sell-player-btn:active { transform: scale(.97); }

.sd-sell-bank-btn {
  background: rgba(239,68,68,.08);
  border-color: rgba(239,68,68,.28);
  color: #fca5a5;
}
.sd-sell-bank-btn:hover { background: rgba(239,68,68,.15); }

.sd-sell-player-btn {
  background: rgba(16,185,129,.08);
  border-color: rgba(16,185,129,.28);
  color: #6ee7b7;
}
.sd-sell-player-btn:hover { background: rgba(16,185,129,.15); }

.sd-sell-icon {
  width: 22px;
  height: 22px;
  stroke: currentColor;
  flex-shrink: 0;
}

.sd-sell-btn-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.sd-sell-btn-label {
  font-size: 13px;
  font-weight: 700;
}
.sd-sell-btn-sub {
  font-size: 12px;
  opacity: .7;
}

/* ── 出售确认卡（银行） ── */
.sell-confirm-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 0 16px;
}
.sell-confirm-icon-wrap {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}
.sell-confirm-icon-wrap--bank {
  background: rgba(239,68,68,.12);
  color: #fca5a5;
}
.sell-confirm-icon {
  width: 36px;
  height: 36px;
  stroke: currentColor;
}
.sell-confirm-name {
  font-size: 18px;
  font-weight: 800;
  color: #ede9fe;
}
.sell-confirm-amount {
  font-size: 32px;
  font-weight: 900;
  color: #fca5a5;
  letter-spacing: -.03em;
}
.sell-confirm-hint {
  font-size: 12px;
  color: #64748b;
}

/* ── 买家列表 ── */
.sell-buyer-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}
.sell-buyer-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255,255,255,.05);
  border: 1.5px solid rgba(255,255,255,.09);
  cursor: pointer;
  transition: background .12s, border-color .12s;
  -webkit-tap-highlight-color: transparent;
}
.sell-buyer-item.active {
  background: rgba(16,185,129,.1);
  border-color: rgba(16,185,129,.45);
}
.sell-buyer-item.disabled {
  opacity: .55;
}
.sell-buyer-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}
.sell-buyer-info {
  flex: 1;
  min-width: 0;
}
.sell-buyer-name {
  font-size: 15px;
  font-weight: 700;
  color: #eef2ff;
}
.sell-buyer-balance {
  font-size: 12px;
  color: #64748b;
  margin-top: 1px;
}
.sell-buyer-check {
  width: 20px;
  height: 20px;
  color: #34d399;
  flex-shrink: 0;
}

.pending-sales-card {
  margin-top: 16px;
}
.pending-sales-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.pending-sales-head h2 {
  margin: 0 0 4px;
}
.pending-sales-head .muted {
  margin: 0;
}
.pending-sales-count {
  min-width: 28px;
  height: 28px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(16,185,129,.14);
  border: 1px solid rgba(16,185,129,.35);
  color: #6ee7b7;
  font-size: 13px;
  font-weight: 800;
}
.pending-sales-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pending-sale-item {
  padding: 14px;
  border-radius: 16px;
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.1);
}
.pending-sale-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.pending-sale-name {
  font-size: 16px;
  font-weight: 800;
  color: #f8fafc;
}
.pending-sale-meta {
  margin-top: 4px;
  font-size: 13px;
  color: #94a3b8;
}
.pending-sale-price {
  margin-top: 10px;
  font-size: 24px;
  font-weight: 900;
  color: #86efac;
}
.pending-sale-actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}
.pending-sale-btn {
  flex: 1;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.14);
  padding: 11px 12px;
  font-weight: 800;
}
.pending-sale-btn--ghost {
  background: rgba(255,255,255,.05);
  color: #cbd5e1;
}
.pending-sale-btn--accept {
  background: linear-gradient(135deg, #10b981, #047857);
  border-color: transparent;
  color: #fff;
}
.pending-sale-btn:disabled {
  opacity: .5;
}

/* ── 操作行（返回 + 确认） ── */
.sell-actions {
  display: flex;
  gap: 10px;
  align-items: stretch;
}
.sell-back-btn {
  width: 46px;
  flex-shrink: 0;
  border-radius: 12px;
  background: rgba(255,255,255,.07);
  border: 1px solid rgba(255,255,255,.12);
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background .12s;
}
.sell-back-btn:hover { background: rgba(255,255,255,.13); color: #94a3b8; }
.sell-back-icon {
  width: 18px;
  height: 18px;
  stroke: currentColor;
}
.sell-confirm-btn {
  flex: 1;
  padding: 14px 0;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 800;
  border: 0;
  cursor: pointer;
  transition: opacity .15s, transform .1s;
  -webkit-tap-highlight-color: transparent;
}
.sell-confirm-btn:disabled { opacity: .4; cursor: default; }
.sell-confirm-btn:not(:disabled):active { transform: scale(.97); }
.sell-confirm-btn--bank {
  background: linear-gradient(135deg, #ef4444, #b91c1c);
  color: #fff;
  box-shadow: 0 4px 16px rgba(239,68,68,.35);
}
.sell-confirm-btn--player {
  background: linear-gradient(135deg, #10b981, #047857);
  color: #fff;
  box-shadow: 0 4px 16px rgba(16,185,129,.35);
}

/* ── 建房地块选择按钮 ── */
.build-pick-btn {
  color: #6ee7b7;
  background: rgba(16,185,129,.1);
  border-color: rgba(16,185,129,.5);
}
.build-pick-btn:hover {
  background: rgba(16,185,129,.2);
  border-color: rgba(16,185,129,.8);
}
.build-count-card {
  margin-top: 10px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.08);
}

.build-count-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  color: #eef2ff;
  font-weight: 700;
}

.build-count-sub {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 600;
}

.build-count-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.build-count-btn {
  min-width: 64px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.04);
  color: #e2e8f0;
  font-weight: 700;
}

.build-count-btn.active {
  background: rgba(16,185,129,.16);
  border-color: rgba(16,185,129,.55);
  color: #ecfdf5;
}

.build-count-full,
.build-count-total {
  margin-top: 10px;
  font-size: 13px;
  color: #cbd5e1;
}

/* ── 建房地块弹窗列表 ── */
.build-picker-empty {
  text-align: center;
  padding: 24px 0;
  color: #64748b;
  font-size: 14px;
}

.build-picker-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.build-picker-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255,255,255,.05);
  border: 1.5px solid rgba(255,255,255,.09);
  cursor: pointer;
  transition: background .12s, border-color .12s;
  -webkit-tap-highlight-color: transparent;
}
.build-picker-item:active { transform: scale(.98); }
.build-picker-item.active {
  background: rgba(16,185,129,.1);
  border-color: rgba(16,185,129,.45);
}

.build-picker-left {
  flex: 1;
  min-width: 0;
}
.build-picker-name {
  font-size: 15px;
  font-weight: 700;
  color: #eef2ff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.build-picker-sub {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}

.build-picker-rents {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  flex-shrink: 0;
}
.build-rent-chip {
  font-size: 11px;
  color: #a78bfa;
  background: rgba(124,58,237,.12);
  border-radius: 5px;
  padding: 1px 6px;
  font-weight: 600;
}

.build-picker-check {
  width: 20px;
  height: 20px;
  color: #34d399;
  flex-shrink: 0;
  margin-left: 4px;
}

.build-picker-confirm {
  width: 100%;
  margin-top: 4px;
}
.build-picker-confirm:disabled { opacity: .4; cursor: default; }

/* ── 已抵押地产卡片 ── */
.deed-card-item--mortgaged {
  background: rgba(100,116,139,.08);
  border-color: rgba(100,116,139,.25);
}
.deed-card-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.deed-mortgaged-badge {
  font-size: 10px;
  font-weight: 700;
  color: #f59e0b;
  background: rgba(245,158,11,.15);
  border: 1px solid rgba(245,158,11,.35);
  border-radius: 4px;
  padding: 1px 5px;
  letter-spacing: .03em;
  flex-shrink: 0;
}

/* ── 已抵押状态通知 ── */
.sd-mortgaged-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(245,158,11,.1);
  border: 1px solid rgba(245,158,11,.3);
  border-radius: 12px;
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 600;
  color: #fbbf24;
}
.sd-mortgaged-notice-icon {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  flex-shrink: 0;
}

/* ── 已抵押时过路费文字变暗 ── */
.sd-rent-amount--mortgaged {
  color: #475569 !important;
  font-size: 14px !important;
  text-decoration: line-through;
  opacity: .7;
}

/* ── 抵押 / 赎回按钮行 ── */
.sd-mortgage-row {
  padding-top: 2px;
}
.sd-mortgage-btn,
.sd-redeem-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 14px 14px;
  border-radius: 14px;
  cursor: pointer;
  border: 1.5px solid;
  transition: background .15s, transform .1s;
  -webkit-tap-highlight-color: transparent;
  text-align: left;
}
.sd-mortgage-btn:active,
.sd-redeem-btn:active { transform: scale(.97); }
.sd-mortgage-btn {
  background: rgba(245,158,11,.08);
  border-color: rgba(245,158,11,.28);
  color: #fcd34d;
}
.sd-mortgage-btn:hover { background: rgba(245,158,11,.15); }
.sd-redeem-btn {
  background: rgba(59,130,246,.08);
  border-color: rgba(59,130,246,.28);
  color: #93c5fd;
}
.sd-redeem-btn:hover { background: rgba(59,130,246,.15); }

/* ── 抵押/赎回确认图标 ── */
.sell-confirm-icon-wrap--mortgage {
  background: rgba(245,158,11,.12);
  color: #fcd34d;
}
.sell-confirm-icon-wrap--redeem {
  background: rgba(59,130,246,.12);
  color: #93c5fd;
}
.sell-confirm-amount--mortgage {
  color: #6ee7b7;
  font-size: 32px;
  font-weight: 900;
  letter-spacing: -.03em;
}
.sell-confirm-amount--redeem {
  color: #fca5a5;
  font-size: 32px;
  font-weight: 900;
  letter-spacing: -.03em;
}

/* ── 抵押/赎回确认按钮 ── */
.sell-confirm-btn--mortgage {
  background: linear-gradient(135deg, #f59e0b, #b45309);
  color: #fff;
  box-shadow: 0 4px 16px rgba(245,158,11,.35);
}
.sell-confirm-btn--redeem {
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  color: #fff;
  box-shadow: 0 4px 16px rgba(59,130,246,.35);
}

/* ── 出售房产给银行（逐级） ── */
.sd-sell-building-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 14px;
  border-radius: 14px;
  cursor: pointer;
  border: 1.5px solid rgba(251,146,60,.28);
  background: rgba(251,146,60,.08);
  color: #fdba74;
  transition: background .15s, transform .1s;
  -webkit-tap-highlight-color: transparent;
  text-align: left;
  width: 100%;
}
.sd-sell-building-btn:active { transform: scale(.97); }
.sd-sell-building-btn:hover { background: rgba(251,146,60,.15); }

.sell-confirm-icon-wrap--sell-building {
  background: rgba(251,146,60,.12);
  color: #fdba74;
}
.sell-confirm-amount--sell-building {
  color: #6ee7b7;
  font-size: 32px;
  font-weight: 900;
  letter-spacing: -.03em;
}
.sell-confirm-btn--sell-building {
  background: linear-gradient(135deg, #f97316, #c2410c);
  color: #fff;
  box-shadow: 0 4px 16px rgba(249,115,22,.35);
}

.sd-sell-building-info {
  font-size: 13px;
  color: #94a3b8;
  margin-bottom: 4px;
}

.sd-sell-building-picker {
  width: 100%;
  padding: 0 16px;
}
.sd-sell-building-label {
  font-size: 13px;
  font-weight: 600;
  color: #94a3b8;
  margin-bottom: 8px;
}
.sd-sell-building-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.sd-sell-building-option {
  min-width: 44px;
  height: 40px;
  border-radius: 12px;
  border: 1.5px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.06);
  color: #c4b5fd;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: background .12s, border-color .12s, transform .1s;
  -webkit-tap-highlight-color: transparent;
}
.sd-sell-building-option.active {
  background: rgba(251,146,60,.18);
  border-color: rgba(251,146,60,.55);
  color: #fdba74;
}
.sd-sell-building-option:active { transform: scale(.93); }

/* ══ 存款 tab ══ */
.deposit-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.deposit-rate-card {
  background: linear-gradient(135deg, rgba(52,211,153,.12), rgba(16,185,129,.06));
  border: 1px solid rgba(52,211,153,.3);
  border-radius: 18px;
  padding: 18px 20px;
  text-align: center;
}
.deposit-rate-label {
  font-size: 12px;
  color: #6ee7b7;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .08em;
  margin-bottom: 6px;
}
.deposit-rate-val {
  font-size: 40px;
  font-weight: 900;
  color: #34d399;
  letter-spacing: -.03em;
  line-height: 1;
  margin-bottom: 6px;
}
.deposit-rate-sub {
  font-size: 12px;
  color: #4ade80;
  opacity: .7;
}

.deposit-input-card {
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 18px;
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.deposit-input-label {
  font-size: 14px;
  font-weight: 700;
  color: #a7b0cf;
}
.deposit-preview {
  font-size: 13px;
  color: #a7b0cf;
  text-align: center;
  background: rgba(52,211,153,.07);
  border-radius: 10px;
  padding: 8px 12px;
}
.deposit-preview-val {
  font-weight: 800;
  color: #34d399;
}
.deposit-btn {
  width: 100%;
  padding: 14px 0;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 800;
  border: 0;
  cursor: pointer;
  background: linear-gradient(135deg, #10b981, #047857);
  color: #fff;
  box-shadow: 0 4px 16px rgba(16,185,129,.35);
  transition: opacity .15s, transform .1s;
  -webkit-tap-highlight-color: transparent;
}
.deposit-btn:disabled { opacity: .4; cursor: default; }
.deposit-btn:not(:disabled):active { transform: scale(.97); }

.deposit-list-title {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: .08em;
  padding: 0 2px;
}
.deposit-empty {
  text-align: center;
  color: #475569;
  font-size: 14px;
  padding: 24px 0;
}
.deposit-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: rgba(16,185,129,.07);
  border: 1px solid rgba(16,185,129,.2);
  border-radius: 14px;
  padding: 14px 16px;
}
.deposit-item-left {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.deposit-item-amount {
  font-size: 20px;
  font-weight: 900;
  color: #6ee7b7;
  letter-spacing: -.02em;
}
.deposit-item-time {
  font-size: 11px;
  color: #64748b;
}
.deposit-item-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}
.deposit-item-rate {
  font-size: 12px;
  font-weight: 600;
  color: #34d399;
  background: rgba(52,211,153,.12);
  border-radius: 6px;
  padding: 2px 7px;
}
.deposit-withdraw-btn {
  padding: 7px 14px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid rgba(239,68,68,.35);
  background: rgba(239,68,68,.1);
  color: #fca5a5;
  transition: background .15s;
  -webkit-tap-highlight-color: transparent;
}
.deposit-withdraw-btn:hover { background: rgba(239,68,68,.2); }
.deposit-withdraw-btn:active { transform: scale(.96); }

.deposit-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 4px 0;
  border-top: 1px solid rgba(255,255,255,.08);
  font-size: 13px;
  color: #64748b;
}
.deposit-total-val {
  font-size: 15px;
  font-weight: 800;
  color: #34d399;
}

/* ══ 贷款 tab ══ */
.loan-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.loan-limit-card {
  background: linear-gradient(135deg, rgba(239,68,68,.1), rgba(220,38,38,.05));
  border: 1px solid rgba(239,68,68,.3);
  border-radius: 18px;
  padding: 16px 20px;
}
.loan-limit-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.loan-limit-label {
  font-size: 13px;
  font-weight: 600;
  color: #fca5a5;
  text-transform: uppercase;
  letter-spacing: .06em;
}
.loan-limit-val {
  font-size: 28px;
  font-weight: 900;
  color: #f87171;
  letter-spacing: -.03em;
}
.loan-limit-sub {
  font-size: 11px;
  color: #94a3b8;
}

.loan-input-card {
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 18px;
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.loan-input-label {
  font-size: 14px;
  font-weight: 700;
  color: #a7b0cf;
}
.loan-interest-hint {
  font-size: 12px;
  color: #7c86aa;
  line-height: 1.5;
}

.loan-btn {
  width: 100%;
  padding: 14px 0;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 800;
  border: 0;
  cursor: pointer;
  background: linear-gradient(135deg, #7c3aed, #4c1d95);
  color: #fff;
  box-shadow: 0 4px 16px rgba(124,58,237,.35);
  transition: opacity .15s, transform .1s;
  -webkit-tap-highlight-color: transparent;
}
.loan-btn:disabled { opacity: .4; cursor: default; }
.loan-btn:not(:disabled):active { transform: scale(.97); }

.loan-list-title {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: .08em;
  padding: 0 2px;
}
.loan-empty {
  text-align: center;
  color: #475569;
  font-size: 14px;
  padding: 24px 0;
}
.loan-item {
  background: rgba(239,68,68,.06);
  border: 1px solid rgba(239,68,68,.2);
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.loan-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.loan-item-principal {
  font-size: 14px;
  font-weight: 600;
  color: #94a3b8;
}
.loan-rate-badge {
  font-size: 12px;
  font-weight: 700;
  color: #fca5a5;
  background: rgba(239,68,68,.14);
  border: 1px solid rgba(239,68,68,.3);
  border-radius: 6px;
  padding: 2px 7px;
}
.loan-item-remaining {
  font-size: 14px;
  color: #a7b0cf;
}
.loan-remaining-val {
  font-size: 22px;
  font-weight: 900;
  color: #f87171;
  letter-spacing: -.02em;
}
.loan-repay-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.loan-repay-input {
  flex: 1;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,.15);
  background: rgba(255,255,255,.07);
  color: #eef2ff;
  font-size: 14px;
  font-weight: 600;
  outline: none;
  min-width: 0;
}
.loan-repay-input:focus {
  border-color: rgba(124,58,237,.5);
  background: rgba(124,58,237,.08);
}
.loan-repay-btn {
  padding: 9px 14px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid rgba(124,58,237,.4);
  background: rgba(124,58,237,.16);
  color: #c4b5fd;
  white-space: nowrap;
  transition: background .15s;
  -webkit-tap-highlight-color: transparent;
}
.loan-repay-btn:hover { background: rgba(124,58,237,.28); }
.loan-repay-all-btn {
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid rgba(16,185,129,.35);
  background: rgba(16,185,129,.12);
  color: #6ee7b7;
  white-space: nowrap;
  transition: background .15s;
  -webkit-tap-highlight-color: transparent;
}
.loan-repay-all-btn:hover { background: rgba(16,185,129,.24); }

.loan-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 4px 0;
  border-top: 1px solid rgba(255,255,255,.08);
  font-size: 13px;
  color: #64748b;
}
.loan-total-val {
  font-size: 15px;
  font-weight: 800;
  color: #f87171;
}

/* ── 暂停覆盖层 ── */
.pause-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(15, 23, 42, 0.88);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: pause-fade-in 0.3s ease;
}
@keyframes pause-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.pause-overlay-content {
  text-align: center;
  color: #e2e8f0;
  padding: 40px;
}
.pause-icon {
  font-size: 64px;
  margin-bottom: 16px;
  animation: pause-pulse 2s ease-in-out infinite;
}
@keyframes pause-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.95); }
}
.pause-title {
  font-size: 28px;
  font-weight: 800;
  margin: 0 0 12px;
  color: #f1f5f9;
}
.pause-desc {
  font-size: 15px;
  color: #94a3b8;
  margin: 0;
}

.top-toast {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.95);
  color: #f8fafc;
  padding: 10px 20px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  z-index: 10000;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  pointer-events: none;
  backdrop-filter: blur(8px);
}

.toast-slide-enter-active,
.toast-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.toast-slide-enter-from,
.toast-slide-leave-to {
  transform: translate(-50%, -20px);
  opacity: 0;
}

</style>
