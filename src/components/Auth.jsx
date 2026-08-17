import React, { useState } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import InputField from './InputField';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';

const loginSchema = Yup.object({
  email: Yup.string()
    .email('Please enter a valid email address')
    .required('Email address is required'),
  password: Yup.string()
    .min(6, 'Password must be at least 6 characters')
    .required('Password is required'),
  rememberMe: Yup.boolean(),
});

const signupSchema = Yup.object({
  fullName: Yup.string()
    .min(3, 'Full name must be at least 3 characters')
    .required('Full name is required'),
  email: Yup.string()
    .email('Please enter a valid email address')
    .required('Email address is required'),
  password: Yup.string()
    .min(6, 'Password must be at least 6 characters')
    .required('Password is required'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('password')], 'Passwords must match')
    .required('Please confirm your password'),
  agreeTerms: Yup.boolean()
    .oneOf([true], 'You must accept the Terms & Conditions'),
});

const UserIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const EmailIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const LockIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

export default function Auth({ onLogin }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const loginInitialValues = { email: '', password: '', rememberMe: true };
  const signupInitialValues = { fullName: '', email: '', password: '', confirmPassword: '', agreeTerms: false };

  const handleFormSubmit = async (values) => {
    setErrorMessage(null);
    setLoading(true);

    const endpoint = isSignUp
      ? `${API_BASE}/api/auth/signup`
      : `${API_BASE}/api/auth/login`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(data.error || 'Authentication failed');
        setLoading(false);
        return;
      }

      localStorage.setItem('jwt_token', data.token);

      if (onLogin) {
        onLogin(data.user);
      }
    } catch (err) {
      setErrorMessage('Server connection error. Please try again!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden text-gray-800">
      <div className="flex border-b border-gray-200 bg-gray-50/50">
        <button
          type="button"
          onClick={() => { setIsSignUp(false); setErrorMessage(null); }}
          className={`flex-1 py-3.5 text-sm font-semibold transition-colors duration-200 cursor-pointer ${
            !isSignUp
              ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => { setIsSignUp(true); setErrorMessage(null); }}
          className={`flex-1 py-3.5 text-sm font-semibold transition-colors duration-200 cursor-pointer ${
            isSignUp
              ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Sign Up
        </button>
      </div>

      <div className="p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600 text-white font-bold text-xl mb-3 shadow-lg shadow-blue-500/30">
            💬
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">ChitChat</h1>
          <p className="text-gray-500 text-sm mt-1">
            {isSignUp
              ? 'Create an account to start chatting'
              : 'Welcome back! Sign in to continue'}
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl text-sm font-medium bg-red-50 border border-red-200 text-red-700">
            {errorMessage}
          </div>
        )}

        <Formik
          key={isSignUp ? 'signup' : 'login'}
          initialValues={isSignUp ? signupInitialValues : loginInitialValues}
          validationSchema={isSignUp ? signupSchema : loginSchema}
          onSubmit={handleFormSubmit}
        >
          {({ values, handleChange, handleBlur, touched, errors }) => (
            <Form className="space-y-4">
              {isSignUp && (
                <InputField
                  label="Full Name"
                  name="fullName"
                  type="text"
                  placeholder="John Doe"
                  icon={<UserIcon />}
                />
              )}

              <InputField
                label="Email Address"
                name="email"
                type="email"
                placeholder="name@example.com"
                icon={<EmailIcon />}
              />

              <InputField
                label="Password"
                name="password"
                type="password"
                placeholder="••••••••"
                icon={<LockIcon />}
              />

              {isSignUp && (
                <InputField
                  label="Confirm Password"
                  name="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  icon={<LockIcon />}
                />
              )}

              {!isSignUp ? (
                <div className="flex items-center justify-start text-sm pt-1">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="rememberMe"
                      checked={values.rememberMe}
                      onChange={handleChange}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-gray-600 text-xs font-medium">Remember me</span>
                  </label>
                </div>
              ) : (
                <div className="pt-1">
                  <label className="flex items-start space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="agreeTerms"
                      checked={values.agreeTerms}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-gray-600 text-xs">
                      I agree to the{' '}
                      <a href="#" className="text-blue-600 hover:underline font-semibold">
                        Terms & Conditions
                      </a>
                    </span>
                  </label>
                  {touched.agreeTerms && errors.agreeTerms && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{errors.agreeTerms}</p>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 mt-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-500/20 focus:outline-none focus:ring-2 focus:ring-blue-500/40 active:scale-[0.99] transition-all duration-150 text-sm cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Processing...' : isSignUp ? 'Create Account' : 'Sign In'}
              </button>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
}
