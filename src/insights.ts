export interface ExpenseSummary {
  currentMonth: {
    label: string
    total: number
    byCategory: Record<string, number>
    count: number
  }
  lastSixMonths: Array<{ label: string; total: number }>
}

export async function getInsights(summary: ExpenseSummary): Promise<string> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) throw new Error('VITE_GEMINI_API_KEY is not set')

  const categoryLines = Object.entries(summary.currentMonth.byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => `  - ${cat}: ${amt.toFixed(0)} kr`)
    .join('\n')

  const trendLines = summary.lastSixMonths
    .map(m => `  ${m.label}: ${m.total.toFixed(0)} kr`)
    .join('\n')

  const prompt = `You are a personal finance assistant. Analyze this expense data and give 3 concise, specific insights. Be direct and practical. Do not use markdown — write plain numbered points (1. 2. 3.). Keep each point to 1-2 sentences. Use kr as the currency.

Current month (${summary.currentMonth.label}):
- Total: ${summary.currentMonth.total.toFixed(0)} kr across ${summary.currentMonth.count} transactions
- By category:
${categoryLines || '  (no expenses yet)'}

Spending trend (last 6 months):
${trendLines}`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 350 },
      }),
    }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `API error ${res.status}`)
  }

  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? 'No response.'
}
