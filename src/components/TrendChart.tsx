import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

interface TrendChartProps {
  data: number[]
}

export function TrendChart({ data }: TrendChartProps) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!ref.current) {
      return
    }

    const chart = echarts.init(ref.current)
    chart.setOption({
      backgroundColor: 'transparent',
      grid: { left: 8, right: 8, top: 10, bottom: 4, containLabel: false },
      xAxis: {
        type: 'category',
        data: ['00', '04', '08', '12', '16', '20', '24'],
        boundaryGap: false,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#86a8c6', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        min: 40,
        max: 100,
        splitLine: { lineStyle: { color: 'rgba(88, 185, 255, 0.12)' } },
        axisLabel: { show: false },
      },
      series: [
        {
          type: 'line',
          data,
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { width: 3, color: '#30c7ff' },
          itemStyle: { color: '#ff3b30', borderColor: '#ffffff', borderWidth: 1 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(48, 199, 255, 0.42)' },
              { offset: 1, color: 'rgba(48, 199, 255, 0.03)' },
            ]),
          },
        },
      ],
    })

    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(ref.current)

    return () => {
      observer.disconnect()
      chart.dispose()
    }
  }, [data])

  return <div className="trend-chart" ref={ref} />
}
