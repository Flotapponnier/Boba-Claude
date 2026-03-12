'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'

function CliAuthContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { authToken, setAuthToken } = useAuthStore()
  const [status, setStatus] = useState<'authorizing' | 'success' | 'error'>('authorizing')
  const [error, setError] = useState<string | null>(null)

  const requestId = searchParams.get('requestId')

  useEffect(() => {
    async function authorize() {
      if (!requestId) {
        setStatus('error')
        setError('Missing requestId parameter')
        return
      }

      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

      // If no token, create a guest account first
      if (!authToken) {
        try {
          const guestResponse = await fetch(`${API_URL}/api/auth/guest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })

          if (!guestResponse.ok) {
            throw new Error('Failed to create guest account')
          }

          const { token } = await guestResponse.json()

          // Store the token in the frontend
          setAuthToken(token)

          // Now complete the CLI auth with this token
          const completeResponse = await fetch(`${API_URL}/api/auth/cli-complete`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ requestId }),
          })

          if (!completeResponse.ok) {
            throw new Error('Failed to authorize CLI')
          }

          setStatus('success')

          // Auto-close after 3 seconds
          setTimeout(() => {
            window.close()
          }, 3000)
        } catch (err) {
          setStatus('error')
          setError(err instanceof Error ? err.message : 'Unknown error')
        }
        return
      }

      // Already have a token, just complete the auth
      try {
        const response = await fetch(`${API_URL}/api/auth/cli-complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ requestId }),
        })

        if (!response.ok) {
          throw new Error('Failed to authorize CLI')
        }

        setStatus('success')

        // Auto-close after 3 seconds
        setTimeout(() => {
          window.close()
        }, 3000)
      } catch (err) {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    }

    authorize()
  }, [requestId, authToken, router, setAuthToken])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        {status === 'authorizing' && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h1 className="text-2xl font-bold mb-2">Authorizing CLI...</h1>
            <p className="text-gray-600">Please wait while we authorize your CLI</p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center">
            <div className="text-green-600 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2 text-green-600">Authorization Successful!</h1>
            <p className="text-gray-600 mb-4">
              Your CLI has been authorized. You can close this window.
            </p>
            <p className="text-sm text-gray-500">This window will close automatically in 3 seconds...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="text-red-600 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2 text-red-600">Authorization Failed</h1>
            <p className="text-gray-600 mb-4">{error || 'An unknown error occurred'}</p>
            <button
              onClick={() => window.close()}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
            >
              Close Window
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function CliAuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    }>
      <CliAuthContent />
    </Suspense>
  )
}
