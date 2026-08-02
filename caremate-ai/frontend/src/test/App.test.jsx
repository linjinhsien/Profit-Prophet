import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

describe('App', () => {
  it('renders the app header', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByText('CareMate AI')).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByText('語音陪伴')).toBeInTheDocument();
    expect(screen.getByText('照護面板')).toBeInTheDocument();
    expect(screen.getByText('長者資料')).toBeInTheDocument();
    expect(screen.getByText('記憶系統')).toBeInTheDocument();
  });

  it('renders voice chat page by default', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByText(/陪伴助手/)).toBeInTheDocument();
  });

  it('renders dashboard page', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByText('照護者面板')).toBeInTheDocument();
  });
});
