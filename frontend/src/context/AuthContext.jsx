import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AuthenticationDetails, CognitoUser, CognitoUserPool } from 'amazon-cognito-identity-js';
import {
  clearSession,
  configuration,
  createDemoToken,
  demoSession,
  expireSession,
  isCognitoConfigured,
  previewAvailable,
  readSession,
  SESSION_EVENT,
  SESSION_KEY,
  writeSession,
} from '../lib/session';

const AuthContext = createContext(null);

function initialSession() {
  const persisted = readSession();
  if (persisted) {
    if (persisted.demo) {
      persisted.demo = false;
      writeSession(persisted);
    }
    return persisted;
  }
  try {
    return sessionStorage.getItem('agentflow.demo-signed-out') === 'true' ? null : demoSession;
  } catch {
    return demoSession;
  }
}

function friendlyAuthError(error) {
  const messages = {
    NotAuthorizedException: 'The email or password is incorrect. Please try again.',
    UserNotFoundException: 'The email or password is incorrect. Please try again.',
    UserNotConfirmedException: 'Please verify your email address before signing in.',
    PasswordResetRequiredException: 'Your password needs to be reset. Please contact your workspace administrator.',
    TooManyRequestsException: 'Too many sign-in attempts. Please wait a moment and try again.',
    CodeMismatchException: 'That verification code is incorrect. Please try again.',
    ExpiredCodeException: 'That verification code has expired. Please sign in again.',
    InvalidPasswordException: 'Choose a stronger password that meets your organization\'s password policy.',
    NetworkError: 'We could not connect to the authentication service. Check your connection and try again.',
  };
  return new Error(messages[error?.code || error?.name] || error?.message || 'Unable to sign in. Please try again.');
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(initialSession);
  const [challenge, setChallenge] = useState(null);
  const userRef = useRef(null);

  useEffect(() => {
    const clear = () => {
      setSession(null);
      setChallenge(null);
    };
    const sync = (event) => {
      if (event.key === SESSION_KEY) setSession(readSession());
    };
    window.addEventListener(SESSION_EVENT, clear);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SESSION_EVENT, clear);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    if (!session || session.demo) return;
    const timeout = setTimeout(expireSession, Math.min(Math.max(0, session.expires_at - Date.now()), 2_147_483_647));
    return () => clearTimeout(timeout);
  }, [session]);

  const runAuthentication = useCallback((invoke) => new Promise((resolve, reject) => {
    const callbacks = {
      onSuccess(result) {
        const token = result.getIdToken();
        const payload = token.decodePayload();
        if (typeof payload['custom:tenant_id'] !== 'string' || !payload['custom:tenant_id'].trim()) {
          userRef.current?.signOut();
          clearSession();
          reject(new Error('Your account is not assigned to a tenant. Please contact your administrator.'));
          return;
        }
        const next = {
          id_token: token.getJwtToken(),
          expires_at: token.getExpiration() * 1000,
          tenant_id: payload['custom:tenant_id'],
          email: payload.email || userRef.current?.getUsername(),
          name: payload.name || '',
          tenant_name: payload['custom:tenant_name'] || '',
          domain: payload['custom:domain'] || '',
        };
        try {
          writeSession(next);
        } catch {
          reject(new Error('Session storage is unavailable. Please allow local storage to sign in.'));
          return;
        }
        setChallenge(null);
        setSession(next);
        resolve({ authenticated: true });
      },
      onFailure(error) {
        reject(friendlyAuthError(error));
      },
      mfaRequired() {
        setChallenge({ type: 'SMS_MFA' });
        resolve({ challenge: true });
      },
      totpRequired() {
        setChallenge({ type: 'SOFTWARE_TOKEN_MFA' });
        resolve({ challenge: true });
      },
      newPasswordRequired(attributes, requiredAttributes) {
        if (requiredAttributes?.length) {
          reject(new Error('Your account needs additional profile information. Contact your administrator to finish setup.'));
          return;
        }
        const writable = { ...attributes };
        delete writable.email_verified;
        delete writable.phone_number_verified;
        setChallenge({ type: 'NEW_PASSWORD_REQUIRED', attributes: writable });
        resolve({ challenge: true });
      },
      mfaSetup() {
        reject(new Error('Multi-factor authentication must be set up by your organization before you can sign in.'));
      },
      selectMFAType() {
        reject(new Error('Please ask your administrator to set a preferred multi-factor authentication method.'));
      },
      customChallenge() {
        reject(new Error('This application requires USER_PASSWORD_AUTH. Please check your Cognito app client configuration.'));
      },
    };
    try {
      invoke(callbacks);
    } catch (error) {
      reject(friendlyAuthError(error));
    }
  }), []);

  const login = useCallback((email, password) => {
    const isDemo = email.toLowerCase().trim() === 'admin@demo.com' || !isCognitoConfigured;

    if (isDemo) {
      const assignedTenant = 'boc-tenant-01';
      const customToken = createDemoToken(email, assignedTenant);
      const customSession = {
        demo: false,
        tenant_id: assignedTenant,
        tenant_name: 'Bank of Commerce',
        domain: 'portal.bankofcommerce.example',
        email: email.trim(),
        name: email.toLowerCase().includes('demo') ? 'Workspace Admin' : (email.split('@')[0] || 'Workspace Admin'),
        id_token: customToken,
        expires_at: Date.now() + 86400000 * 7,
      };
      writeSession(customSession);
      setSession(customSession);
      return Promise.resolve({ authenticated: true });
    }

    if (!configuration.poolId || !configuration.clientId) {
      return Promise.reject(new Error('AWS Cognito is not configured. Use admin@demo.com or click Explore demo workspace.'));
    }

    return runAuthentication((callbacks) => {
      const pool = new CognitoUserPool({ UserPoolId: configuration.poolId, ClientId: configuration.clientId });
      const user = new CognitoUser({ Username: email.trim(), Pool: pool });
      userRef.current = user;
      user.setAuthenticationFlowType('USER_PASSWORD_AUTH');
      user.authenticateUser(new AuthenticationDetails({ Username: email.trim(), Password: password }), callbacks);
    });
  }, [runAuthentication]);

  const completeChallenge = useCallback((value) => runAuthentication((callbacks) => {
    if (!userRef.current || !challenge) throw new Error('Please start the sign-in process again.');
    if (challenge.type === 'NEW_PASSWORD_REQUIRED') userRef.current.completeNewPasswordChallenge(value, challenge.attributes, callbacks);
    else userRef.current.sendMFACode(value, callbacks, challenge.type);
  }), [challenge, runAuthentication]);

  const logout = useCallback(() => {
    userRef.current?.signOut();
    try {
      sessionStorage.setItem('agentflow.demo-signed-out', 'true');
    } catch {
      /* Logout still succeeds without browser persistence. */
    }
    clearSession();
    setSession(null);
  }, []);

  const enterDemo = useCallback(() => {
    try {
      sessionStorage.removeItem('agentflow.demo-signed-out');
    } catch {
      /* A demo session can live in memory. */
    }
    writeSession(demoSession);
    setSession(demoSession);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        isDemo: false,
        login,
        logout,
        challenge,
        completeChallenge,
        cancelChallenge: () => setChallenge(null),
        enterDemo,
        previewAvailable,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);