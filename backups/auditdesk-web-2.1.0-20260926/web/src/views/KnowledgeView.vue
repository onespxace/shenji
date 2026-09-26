<script setup>
import { computed, ref } from 'vue'
import { ArrowDown, ArrowUp, Collection, Document, Notebook, Search, WarningFilled } from '@element-plus/icons-vue'
import { auditData } from '../lib/audit-data'

const keyword = ref('')
const category = ref('all')
const expanded = ref(new Set())

const categories = [
  { id: 'all', label: '全部', count: auditData.standards.length + auditData.topics.length },
  { id: 'standards', label: '审计准则', count: auditData.standards.length },
  { id: 'topics', label: '实务指引', count: auditData.topics.length }
]
const quickKeywords = ['函证', '收入', '存货', '关联方', '持续经营', '重要性']

const filteredStandards = computed(() => {
  const query = keyword.value.trim()
  return auditData.standards.filter((item) => !query || `${item.no} ${item.name} ${item.desc} ${item.procs}`.includes(query))
})
const filteredTopics = computed(() => {
  const query = keyword.value.trim()
  return auditData.topics.filter((item) => !query || `${item.tag} ${item.title} ${item.body}`.includes(query))
})
const showStandards = computed(() => category.value !== 'topics')
const showTopics = computed(() => category.value !== 'standards')
const totalResults = computed(() => filteredStandards.value.length + filteredTopics.value.length)

function toggle(id) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}
function searchKeyword(value) { keyword.value = value }
</script>

<template>
  <div>
    <el-alert class="mb-16" type="warning" :closable="false" show-icon title="学习速查内容仅用于检索和提示">
      准则名称、准则号和程序提示应以正式发布的准则原文及事务所政策为准；本页不替代职业判断。
    </el-alert>

    <div class="knowledge-layout">
      <el-card class="surface knowledge-sidebar" shadow="never">
        <div class="knowledge-search">
          <el-input v-model="keyword" clearable placeholder="搜索准则或关键词">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
        </div>
        <p class="section-kicker mb-12">内容分类</p>
        <button v-for="item in categories" :key="item.id" class="filter-button" :class="{ 'is-active': category === item.id }" type="button" @click="category = item.id">
          <el-icon><Collection v-if="item.id === 'all'" /><Notebook v-else-if="item.id === 'standards'" /><Document v-else /></el-icon>
          <span>{{ item.label }}</span><span class="filter-count">{{ item.count }}</span>
        </button>
        <el-divider />
        <p class="section-kicker mb-12">高频检索</p>
        <div class="quick-keywords">
          <el-button v-for="item in quickKeywords" :key="item" size="small" text @click="searchKeyword(item)">{{ item }}</el-button>
        </div>
      </el-card>

      <div>
        <div class="flex-between mb-16 flex-wrap">
          <div><span class="text-muted text-small">当前显示 {{ totalResults }} 条内容</span><span v-if="keyword" class="text-muted text-small"> · 关键词：{{ keyword }}</span></div>
          <el-button v-if="keyword || category !== 'all'" size="small" text @click="keyword = ''; category = 'all'">清除筛选</el-button>
        </div>

        <div v-if="showTopics && filteredTopics.length" class="knowledge-list mb-16">
          <article v-for="item in filteredTopics" :key="`topic-${item.title}`" class="knowledge-item">
            <div class="knowledge-item-top"><el-icon class="text-muted"><WarningFilled /></el-icon><span class="knowledge-number">{{ item.tag }}</span><el-tag class="knowledge-tag" size="small" effect="plain">实务提示</el-tag></div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.body }}</p>
          </article>
        </div>

        <div v-if="showStandards && filteredStandards.length" class="knowledge-list">
          <article v-for="item in filteredStandards" :key="`standard-${item.no}`" class="knowledge-item">
            <div class="knowledge-item-top"><span class="knowledge-number">CSA {{ item.no }}</span><el-tag class="knowledge-tag" size="small" effect="plain">准则速查</el-tag></div>
            <h3>{{ item.name }}</h3>
            <p>{{ item.desc }}</p>
            <button class="procedure-toggle" type="button" @click="toggle(item.no)">{{ expanded.has(item.no) ? '收起关键程序' : '查看关键程序' }} <el-icon><ArrowDown v-if="!expanded.has(item.no)" /><ArrowUp v-else /></el-icon></button>
            <div v-if="expanded.has(item.no)" class="knowledge-procedure">关键程序：{{ item.procs }}</div>
          </article>
        </div>

        <el-empty v-if="!totalResults" description="没有找到匹配内容"><el-button type="primary" plain @click="keyword = ''; category = 'all'">清除筛选</el-button></el-empty>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mb-12 { margin-bottom: 12px; }
.mb-16 { margin-bottom: 16px; }
.quick-keywords { display: flex; flex-wrap: wrap; gap: 5px; }
.procedure-toggle { display: inline-flex; align-items: center; gap: 4px; margin-top: 11px; padding: 0; border: 0; color: var(--blue); background: transparent; font-size: 11px; }
.procedure-toggle:hover { color: var(--blue-dark); }
</style>
