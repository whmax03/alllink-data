<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps<{
  data: { date: string; revenue: number; profit: number }[]
}>()

const chartRef = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null

function renderChart() {
  if (!chartRef.value) return
  if (!chart) {
    chart = echarts.init(chartRef.value)
  }

  chart.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: (params: any[]) => {
        let html = params[0].axisValue + '<br/>'
        params.forEach((p) => {
          html += `${p.marker} ${p.seriesName}: $${Number(p.value).toFixed(2)}<br/>`
        })
        return html
      },
    },
    legend: {
      data: ['销售额', '毛利'],
      bottom: 0,
    },
    grid: { left: '3%', right: '4%', bottom: '8%', top: '5%', containLabel: true },
    xAxis: {
      type: 'category',
      data: props.data.map((d) => d.date),
      axisLabel: { fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 11 },
    },
    series: [
      {
        name: '销售额',
        type: 'line',
        data: props.data.map((d) => d.revenue),
        smooth: true,
        lineStyle: { width: 2 },
        itemStyle: { color: '#3b82f6' },
        areaStyle: { color: 'rgba(59, 130, 246, 0.1)' },
      },
      {
        name: '毛利',
        type: 'line',
        data: props.data.map((d) => d.profit),
        smooth: true,
        lineStyle: { width: 2 },
        itemStyle: { color: '#22c55e' },
      },
    ],
  })
}

onMounted(() => {
  renderChart()
  window.addEventListener('resize', () => chart?.resize())
})

onUnmounted(() => {
  window.removeEventListener('resize', () => chart?.resize())
  chart?.dispose()
})

watch(() => props.data, renderChart, { deep: true })
</script>

<template>
  <div ref="chartRef" style="width: 100%; height: 280px"></div>
</template>
