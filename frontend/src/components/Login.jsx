import { useState } from "react";
import { CognitoUserPool, CognitoUser, AuthenticationDetails } from "amazon-cognito-identity-js";

const poolData = {
  UserPoolId: import.meta.env.VITE_COGNITO_POOL_ID,
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
};

export default function Login({ onLoggedIn }) {
  const [email, setEmail] = useState("admin@demo.com");
  const [password, setPassword] = useState("Test123!");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);

    const userPool = new CognitoUserPool(poolData);
    const user = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });

    user.setAuthenticationFlowType("USER_PASSWORD_AUTH");
    user.authenticateUser(authDetails, {
      onSuccess: (session) => {
        const idToken = session.getIdToken().getJwtToken();
        const payload = session.getIdToken().decodePayload();
        localStorage.setItem("id_token", idToken);
        localStorage.setItem("id_token_exp", String(Date.now() + session.getIdToken().getExpiration() * 1000));
        localStorage.setItem("tenant_id", payload["custom:tenant_id"] || "boc-tenant-01");
        setBusy(false);
        onLoggedIn({ token: idToken, tenantId: payload["custom:tenant_id"] });
      },
      onFailure: (err) => {
        setBusy(false);
        setError(err.message || "Login failed");
      },
    });
  };

  return (
    <div className="h-screen flex items-center justify-center bg-slate-950">
      <form onSubmit={submit} className="bg-slate-900 border border-slate-800 rounded-xl p-8 w-96 space-y-4">
        <h1 className="text-xl font-semibold text-slate-100">Sign in</h1>
        <div>
          <label className="text-xs text-slate-400">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100"
          />
        </div>
        {error && <div className="text-red-400 text-xs">{error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 py-2 rounded text-sm font-medium text-white"
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>
        <div className="text-xs text-slate-500 text-center">
          Test: admin@demo.com / Test123!
        </div>
      </form>
    </div>
  );
}