import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import './App.css'

const CATEGORIES = ['Groceries', 'Dining', 'Drinks', 'Transport', 'Housing', 'Entertainment', 'Health', 'Clothes', 'Shopping', 'Other']

function MonthNav({ currentMonth, onPrev, onNext }) {
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

function CategoryBar({ category, amount, max }) {
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

function Summary({ expenses }) {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0)

  const byCategory = expenses.reduce((acc, e) => {
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

function AddExpenseForm({ onAdd, defaultDate }) {
  const [form, setForm] = useState({
    date: defaultDate,
    description: '',
    category: CATEGORIES[0],
    amount: '',
  })

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function handleSubmit(e) {
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

function ExpenseList({ expenses, onDelete }) {
  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="expense-list card">
      <h2>Expenses</h2>
      {sorted.length === 0 ? (
        <p className="empty">No expenses this month.</p>
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
            {sorted.map(e => (
              <tr key={e.id}>
                <td>{new Date(e.date + 'T00:00:00').toLocaleDateString('default', { month: 'short', day: 'numeric' })}</td>
                <td>{e.description}</td>
                <td><span className="badge">{e.category}</span></td>
                <td className="amount-cell">{e.amount.toFixed(2)} kr</td>
                <td><button className="delete-btn" onClick={() => onDelete(e.id)}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [guestMode, setGuestMode] = useState(false)
  const [expenses, setExpenses] = useState([])
  const [currentMonth, setCurrentMonth] = useState(() => {
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
    if (guestMode || !session) { setExpenses([]); return }
    supabase.from('expenses').select('*').then(({ data, error }) => {
      if (!error) setExpenses(data ?? [])
    })
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

  async function handleAdd(expense) {
    if (guestMode) {
      const newExpense = { ...expense, id: crypto.randomUUID() }
      setExpenses(prev => [...prev, newExpense])
      const d = new Date(expense.date + 'T00:00:00')
      setCurrentMonth({ year: d.getFullYear(), month: d.getMonth() })
      return
    }
    const { data, error } = await supabase
      .from('expenses')
      .insert({ ...expense, user_id: session.user.id })
      .select()
      .single()
    if (error) { console.error(error); return }
    setExpenses(prev => [...prev, data])
    const d = new Date(expense.date + 'T00:00:00')
    setCurrentMonth({ year: d.getFullYear(), month: d.getMonth() })
  }

  async function handleDelete(id) {
    if (guestMode) {
      setExpenses(prev => prev.filter(e => e.id !== id))
      return
    }
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) { console.error(error); return }
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  const monthExpenses = expenses.filter(e => {
    const d = new Date(e.date + 'T00:00:00')
    return d.getFullYear() === currentMonth.year && d.getMonth() === currentMonth.month
  })

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
        <MonthNav currentMonth={currentMonth} onPrev={prevMonth} onNext={nextMonth} />
        {!guestMode && (
          <button className="signout-btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
        )}
      </div>
      <div className="layout">
        <aside>
          <Summary expenses={monthExpenses} />
        </aside>
        <main>
          <AddExpenseForm onAdd={handleAdd} defaultDate={defaultDate} />
          <ExpenseList expenses={monthExpenses} onDelete={handleDelete} />
        </main>
      </div>
    </div>
  )
}
