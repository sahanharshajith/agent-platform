import React, { createContext, useContext, useState, useEffect } from "react";
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} from "amazon-cognito-identity-js";

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

// Helper to decode a JWT token payload without external library
function parseJwtPayload(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

// Generate demo JWT token for local testing without AWS account
function createDemoToken(email, tenantId = "boc-tenant-01") {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const exp = Math.floor(Date.now() / 1000) + 86400; // 24 hours
  const payload = btoa(
    JSON.stringify({
      sub: "demo-admin-id",
      email: email,
      "custom:tenant_id": tenantId,
      exp: exp,
      token_use: "id",
      auth_time: Math.floor(Date.now() / 1000),
    })
  );
  const signature = btoa("agentflow-demo-signature");
  return `${header}.${payload}.${signature}`;
}

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem("id_token"));
  const [tenantId, setTenantId] = useState(
    () => localStorage.getItem("tenant_id") || "boc-tenant-01"
  );
  const [userEmail, setUserEmail] = useState(
    () => localStorage.getItem("user_email") || ""
  );
  const [loading, setLoading] = useState(true);

  // Dark mode state: default to dark mode as requested
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("agentflow_theme");
    return saved !== null ? saved === "dark" : true;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add("dark");
      root.classList.remove("light");
      localStorage.setItem("agentflow_theme", "dark");
    } else {
      root.classList.remove("dark");
      root.classList.add("light");
      localStorage.setItem("agentflow_theme", "light");
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  useEffect(() => {
    const storedToken = localStorage.getItem("id_token");
    const storedExp = localStorage.getItem("id_token_exp");

    if (storedToken && storedExp) {
      const expTime = Number(storedExp);
      if (Date.now() >= expTime) {
        logout();
      } else {
        setToken(storedToken);
      }
    } else {
      setToken(null);
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const poolId =
      import.meta.env.VITE_COGNITO_USER_POOL_ID ||
      import.meta.env.VITE_COGNITO_POOL_ID ||
      "";
    const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID || "";

    // If Demo Admin is used, or Cognito variables are placeholder/empty, perform seamless instant demo auth
    const isDemoAccount =
      email.toLowerCase().trim() === "admin@demo.com" ||
      !poolId ||
      !clientId ||
      poolId === "YOUR_USER_POOL_ID";

    if (isDemoAccount) {
      if (
        email.toLowerCase().trim() === "admin@demo.com" &&
        password.length < 3
      ) {
        throw new Error("Password must be at least 3 characters.");
      }

      const assignedTenant = "boc-tenant-01";
      const demoToken = createDemoToken(email, assignedTenant);
      const expirationTimestamp = Date.now() + 24 * 60 * 60 * 1000;

      localStorage.setItem("id_token", demoToken);
      localStorage.setItem("id_token_exp", expirationTimestamp.toString());
      localStorage.setItem("tenant_id", assignedTenant);
      localStorage.setItem("user_email", email);

      setToken(demoToken);
      setTenantId(assignedTenant);
      setUserEmail(email);

      return {
        idToken: demoToken,
        tenantId: assignedTenant,
        email,
      };
    }

    // Standard AWS Cognito USER_PASSWORD_AUTH flow
    return new Promise((resolve, reject) => {
      try {
        const userPool = new CognitoUserPool({
          UserPoolId: poolId,
          ClientId: clientId,
        });

        const cognitoUser = new CognitoUser({
          Username: email,
          Pool: userPool,
        });

        // Strict USER_PASSWORD_AUTH specification
        cognitoUser.setAuthenticationFlowType("USER_PASSWORD_AUTH");

        const authDetails = new AuthenticationDetails({
          Username: email,
          Password: password,
        });

        cognitoUser.authenticateUser(authDetails, {
          onSuccess: (result) => {
            const idTokenObj = result.getIdToken();
            const idTokenString = idTokenObj.getJwtToken();
            const payload = idTokenObj.decodePayload();

            const expirationTimestamp = payload.exp
              ? payload.exp * 1000
              : Date.now() + 3600 * 1000;

            const extractedTenantId =
              payload["custom:tenant_id"] || "boc-tenant-01";

            localStorage.setItem("id_token", idTokenString);
            localStorage.setItem(
              "id_token_exp",
              expirationTimestamp.toString()
            );
            localStorage.setItem("tenant_id", extractedTenantId);
            localStorage.setItem("user_email", email);

            setToken(idTokenString);
            setTenantId(extractedTenantId);
            setUserEmail(email);

            resolve({
              idToken: idTokenString,
              tenantId: extractedTenantId,
              email,
            });
          },
          onFailure: (err) => {
            let message = err.message || "Authentication failed.";
            if (err.code === "NotAuthorizedException") {
              message = "Incorrect email or password. Please verify your credentials.";
            } else if (err.code === "UserNotFoundException") {
              message = "No account found with this email address.";
            } else if (err.code === "PasswordResetRequiredException") {
              message = "Password reset required before logging in.";
            } else if (err.code === "UserNotConfirmedException") {
              message = "Account is not confirmed. Check your email verification link.";
            }
            reject(new Error(message));
          },
          newPasswordRequired: (userAttributes, requiredAttributes) => {
            reject(
              new Error(
                "First-time login: Password reset is required by your administrator."
              )
            );
          },
        });
      } catch (err) {
        reject(
          new Error(err.message || "Failed to initialize Cognito authentication.")
        );
      }
    });
  };

  const logout = () => {
    localStorage.removeItem("id_token");
    localStorage.removeItem("id_token_exp");
    localStorage.removeItem("tenant_id");
    localStorage.removeItem("user_email");

    setToken(null);
    setUserEmail("");
  };

  const value = {
    token,
    tenantId,
    userEmail,
    isAuthenticated: !!token,
    loading,
    darkMode,
    toggleDarkMode,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
