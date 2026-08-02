import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the application title', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('照護人員智慧助理')
  })

  it('renders the brand name', () => {
    render(<App />)
    expect(screen.getByText('PROFIT-PROPHET')).toBeInTheDocument()
  })

  it('renders the AI disclaimer', () => {
    render(<App />)
    expect(
      screen.getByText(/AI 回覆僅供資訊整理與輔助判讀/)
    ).toBeInTheDocument()
  })

  it('has an accessible section with aria-labelledby', () => {
    render(<App />)
    const section = screen.getByRole('region', { name: '照護人員智慧助理' })
    expect(section).toBeInTheDocument()
  })

  it('renders main landmark', () => {
    render(<App />)
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})
