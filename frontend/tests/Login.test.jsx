import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext';
import Login from '../src/pages/Login';
import * as authApi from '../src/api/authApi';

describe('Login Component Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders login form inputs and submit button', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Personnel Authentication')).toBeInTheDocument();
    expect(screen.getByLabelText(/Username or Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Log In to Surveillance Operations/i })).toBeInTheDocument();
  });

  it('allows user to enter credentials into inputs', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>
    );

    const usernameInput = screen.getByLabelText(/Username or Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);

    fireEvent.change(usernameInput, { target: { value: 'admin_test' } });
    fireEvent.change(passwordInput, { target: { value: 'SecuredPass123!' } });

    expect(usernameInput.value).toBe('admin_test');
    expect(passwordInput.value).toBe('SecuredPass123!');
  });

  it('submits login request and handles 401 error cleanly', async () => {
    const error = new Error('Invalid credentials');
    error.statusCode = 401;
    vi.spyOn(authApi, 'login').mockRejectedValue(error);

    render(
      <MemoryRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>
    );

    const usernameInput = screen.getByLabelText(/Username or Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    fireEvent.change(usernameInput, { target: { value: 'admin_test' } });
    fireEvent.change(passwordInput, { target: { value: 'WrongPass!' } });

    const submitBtn = screen.getByRole('button', { name: /Log In to Surveillance Operations/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Invalid credentials/i)).toBeInTheDocument();
    });
  });

  it('successfully authenticates with valid credentials', async () => {
    const mockAuthResponse = {
      success: true,
      token: 'jwt_valid_test_token',
      user: {
        id: 'usr_inv_1',
        username: 'investigator_test',
        role: 'INVESTIGATOR',
      },
    };

    vi.spyOn(authApi, 'login').mockResolvedValue(mockAuthResponse);

    render(
      <MemoryRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>
    );

    const usernameInput = screen.getByLabelText(/Username or Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    fireEvent.change(usernameInput, { target: { value: 'investigator_test' } });
    fireEvent.change(passwordInput, { target: { value: 'SecuredPass123!' } });

    fireEvent.click(screen.getByRole('button', { name: /Log In to Surveillance Operations/i }));

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith({
        username: 'investigator_test',
        password: 'SecuredPass123!',
      });
      expect(localStorage.getItem('vigilance_token')).toBe('jwt_valid_test_token');
    });
  });
});
