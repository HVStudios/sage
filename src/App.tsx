import { useState, useEffect, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import Logo from './Logo'
import './App.css'

interface Expense {
  id: string
  date: string
  description: string
  category: string
  amount: number
  user_id?: string
  created_at?: string
}

interface MonthState {
  year: number
  month: number
}

interface ChartEntry {
  label: string
  total: number
  isCurrent: boolean
}

const CATEGORIES = ['Groceries', 'Dining', 'Drinks', 'Transport', 'Housing', 'Entertainment', 'Health', 'Clothes', 'Shopping', 'Other']

interface MonthNavProps {
  currentMonth: MonthState
  onPrev: () => void
  onNext: () => void
}

function MonthNav({ currentMonth, onPrev, onNext }: MonthNavProps) {
  const label = new Date(currentMonth.year, currentMonth.month).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  })
  return (
    <div className="month-nav card">
      <button onClick={onPrev}>&#8592;</button>
      <h1>{label}</h1>
      <button onClick={onNext}>&#8594;</button>
    </div>
  )
}

interface CategoryBarProps {
  category: string
  amount: number
  max: number
}

function CategoryBar({ category, amount, max }: CategoryBarProps) {
  const pct = max > 0 ? (amount / max) * 100 : 0
  return (
    <div className="category-bar">
      <div className="category-bar-header">
        <span className="category-label">{category}</span>
        <span className="category-amount">{amount.toFixed(2)} kr</span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct.toFixed(1)}%` }} />
      </div>
    </div>
  )
}

interface SummaryProps {
  expenses: Expense[]
}

function Summary({ expenses }: SummaryProps) {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0)

  const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount
    return acc
  }, {})

  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1])
  const max = sorted.length > 0 ? sorted[0][1] : 1

  return (
    <div className="summary card">
      <h2>Summary</h2>
      <div className="total">
        <span>Total spent</span>
        <span className="total-amount">{total.toFixed(2)} kr</span>
      </div>
      <div className="categories">
        {sorted.length === 0 ? (
          <p className="empty">No expenses this month.</p>
        ) : (
          sorted.map(([cat, amt]) => (
            <CategoryBar key={cat} category={cat} amount={amt} max={max} />
          ))
        )}
      </div>
    </div>
  )
}

function ChartTooltip({ active, payload, label }: Partial<TooltipContentProps>) {
  if (!active || !payload?.length) return null
  const value = typeof payload[0].value === 'number' ? payload[0].value : 0
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{label}</p>
      <p className="chart-tooltip-value">{value.toFixed(2)} kr</p>
    </div>
  )
}

interface SpendingChartProps {
  data: ChartEntry[]
}

function SpendingChart({ data }: SpendingChartProps) {
  const accentColor = useMemo(
    () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#aa3bff',
    []
  )
  return (
    <div className="spending-chart card">
      <h2>Last 6 months</h2>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barCategoryGap="35%">
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 13, fill: 'var(--text)' }}
          />
          <YAxis hide width={0} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--accent-bg)' }} />
          <Bar dataKey="total" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.isCurrent ? accentColor : `${accentColor}55`}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

interface AddExpenseFormProps {
  onAdd: (expense: Omit<Expense, 'id' | 'user_id' | 'created_at'>) => void
  defaultDate: string
}

function AddExpenseForm({ onAdd, defaultDate }: AddExpenseFormProps) {
  const [form, setForm] = useState({
    date: defaultDate,
    description: '',
    category: CATEGORIES[0],
    amount: '',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const amount = parseFloat(form.amount)
    if (!form.date || !form.description || isNaN(amount) || amount <= 0) return
    onAdd({ ...form, amount })
    setForm({ date: defaultDate, description: '', category: CATEGORIES[0], amount: '' })
  }

  return (
    <form className="add-form card" onSubmit={handleSubmit}>
      <h2>Add Expense</h2>
      <div className="form-grid">
        <label>
          Date
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
        </label>
        <label>
          Category
          <select value={form.category} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>
          Description
          <input
            type="text"
            placeholder="e.g. Groceries"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            required
          />
        </label>
        <label>
          Amount (kr)
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={form.amount}
            onChange={e => set('amount', e.target.value)}
            required
          />
        </label>
        <button type="submit" className="add-btn">Add Expense</button>
      </div>
    </form>
  )
}

interface ExpenseListProps {
  expenses: Expense[]
  onDelete: (id: string) => void
  onEdit: (id: string, updates: Omit<Expense, 'id' | 'user_id' | 'created_at'>) => void
}

type EditDraft = {
  date: string
  description: string
  category: string
  amount: string | number
}

function ExpenseList({ expenses, onDelete, onEdit }: ExpenseListProps) {
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('All')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft>({ date: '', description: '', category: '', amount: '' })

  function startEdit(e: Expense) {
    setEditingId(e.id)
    setEditDraft({ date: e.date, description: e.description, category: e.category, amount: e.amount })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDraft({ date: '', description: '', category: '', amount: '' })
  }

  function saveEdit(id: string) {
    const amount = parseFloat(String(editDraft.amount))
    if (!editDraft.date || !editDraft.description || isNaN(amount) || amount <= 0) return
    onEdit(id, { date: editDraft.date, description: editDraft.description, category: editDraft.category, amount })
    setEditingId(null)
    setEditDraft({ date: '', description: '', category: '', amount: '' })
  }

  const filtered = [...expenses]
    .filter(e => filterCategory === 'All' || e.category === filterCategory)
    .filter(e => e.description.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="expense-list card">
      <h2>Expenses</h2>
      <div className="list-filters">
        <input
          type="search"
          className="filter-search"
          placeholder="Search descriptions…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="filter-category"
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
        >
          <option value="All">All categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      {filtered.length === 0 ? (
        <p className="empty">{expenses.length === 0 ? 'No expenses this month.' : 'No matching expenses.'}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(e => editingId === e.id ? (
              <tr key={e.id} className="editing-row">
                <td>
                  <input type="date" value={editDraft.date}
                    onChange={ev => setEditDraft(d => ({ ...d, date: ev.target.value }))} />
                </td>
                <td>
                  <input type="text" value={editDraft.description}
                    onChange={ev => setEditDraft(d => ({ ...d, description: ev.target.value }))} />
                </td>
                <td>
                  <select value={editDraft.category}
                    onChange={ev => setEditDraft(d => ({ ...d, category: ev.target.value }))}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </td>
                <td>
                  <input type="number" min="0.01" step="0.01" value={String(editDraft.amount)}
                    onChange={ev => setEditDraft(d => ({ ...d, amount: ev.target.value }))} />
                </td>
                <td className="row-actions">
                  <button className="save-btn" onClick={() => saveEdit(e.id)}>&#10003;</button>
                  <button className="cancel-btn" onClick={cancelEdit}>&#10005;</button>
                </td>
              </tr>
            ) : (
              <tr key={e.id}>
                <td>{new Date(e.date + 'T00:00:00').toLocaleDateString('default', { month: 'short', day: 'numeric' })}</td>
                <td>{e.description}</td>
                <td><span className="badge">{e.category}</span></td>
                <td className="amount-cell">{e.amount.toFixed(2)} kr</td>
                <td className="row-actions">
                  <button className="edit-btn" onClick={() => startEdit(e)}>&#9998;</button>
                  <button className="delete-btn" onClick={() => onDelete(e.id)}>&#215;</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [guestMode, setGuestMode] = useState(false)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [currentMonth, setCurrentMonth] = useState<MonthState>(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (guestMode || !session) { setExpenses([]); return }
      const { data, error } = await supabase.from('expenses').select('*')
      if (!cancelled && !error) setExpenses(data ?? [])
    })()
    return () => { cancelled = true }
  }, [session, guestMode])

  function prevMonth() {
    setCurrentMonth(({ year, month }) => {
      const d = new Date(year, month - 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  function nextMonth() {
    setCurrentMonth(({ year, month }) => {
      const d = new Date(year, month + 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  async function handleAdd(expense: Omit<Expense, 'id' | 'user_id' | 'created_at'>) {
    if (guestMode) {
      setExpenses(prev => [...prev, { ...expense, id: crypto.randomUUID() }])
      const d = new Date(expense.date + 'T00:00:00')
      setCurrentMonth({ year: d.getFullYear(), month: d.getMonth() })
      return
    }
    const { data, error } = await supabase
      .from('expenses')
      .insert({ ...expense, user_id: session!.user.id })
      .select()
      .single()
    if (error) { console.error(error); return }
    setExpenses(prev => [...prev, data])
    const d = new Date(expense.date + 'T00:00:00')
    setCurrentMonth({ year: d.getFullYear(), month: d.getMonth() })
  }

  async function handleDelete(id: string) {
    if (guestMode) {
      setExpenses(prev => prev.filter(e => e.id !== id))
      return
    }
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) { console.error(error); return }
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  async function handleEdit(id: string, updates: Omit<Expense, 'id' | 'user_id' | 'created_at'>) {
    if (guestMode) {
      setExpenses(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e))
      return
    }
    const { data, error } = await supabase
      .from('expenses')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) { console.error(error); return }
    setExpenses(prev => prev.map(e => e.id === id ? data : e))
  }

  const monthExpenses = expenses.filter(e => {
    const d = new Date(e.date + 'T00:00:00')
    return d.getFullYear() === currentMonth.year && d.getMonth() === currentMonth.month
  })

  const chartData = useMemo<ChartEntry[]>(() => {
    const now = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i)
      const year = d.getFullYear()
      const month = d.getMonth()
      const label = d.toLocaleString('default', { month: 'short' })
      const total = expenses
        .filter(e => {
          const ed = new Date(e.date + 'T00:00:00')
          return ed.getFullYear() === year && ed.getMonth() === month
        })
        .reduce((sum, e) => sum + e.amount, 0)
      const isCurrent = year === now.getFullYear() && month === now.getMonth()
      return { label, total, isCurrent }
    })
  }, [expenses])

  const defaultDate = new Date(currentMonth.year, currentMonth.month, new Date().getDate())
    .toISOString().split('T')[0]

  if (authLoading) return null
  if (!session && !guestMode) return <Auth onContinueAsGuest={() => setGuestMode(true)} />

  return (
    <div className="app">
      {guestMode && (
        <div className="guest-banner">
          You're browsing as a guest — data won't be saved.{' '}
          <button onClick={() => setGuestMode(false)}>Sign in to save your data</button>
        </div>
      )}
      <div className="app-header">
        <div className="app-brand">
          <Logo size={28} />
          <span className="app-name">Expense Tracker</span>
        </div>
        {!guestMode && (
          <button className="signout-btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
        )}
      </div>
      <MonthNav currentMonth={currentMonth} onPrev={prevMonth} onNext={nextMonth} />
      <SpendingChart data={chartData} />
      <div className="layout">
        <aside>
          <Summary expenses={monthExpenses} />
        </aside>
        <main>
          <AddExpenseForm onAdd={handleAdd} defaultDate={defaultDate} />
          <ExpenseList expenses={monthExpenses} onDelete={handleDelete} onEdit={handleEdit} />
        </main>
      </div>
    </div>
  )
}
