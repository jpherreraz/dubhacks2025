import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  signUp,
  signIn,
  signOut,
  confirmSignUp,
  getCurrentUser,
  fetchUserAttributes,
  type SignUpOutput,
  type SignInOutput,
} from 'aws-amplify/auth';

interface User {
  userId: string;
  email?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUpUser: (email: string, password: string) => Promise<SignUpOutput>;
  confirmSignUpUser: (email: string, code: string) => Promise<void>;
  signInUser: (email: string, password: string) => Promise<SignInOutput>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    try {
      const currentUser = await getCurrentUser();
      console.log('AuthContext: Current user:', currentUser);
      const attributes = await fetchUserAttributes();
      console.log('AuthContext: User attributes:', attributes);
      setUser({
        userId: currentUser.userId,
        email: attributes.email,
      });
      console.log('AuthContext: User set to:', { userId: currentUser.userId, email: attributes.email });
    } catch (error) {
      console.error('AuthContext: Error checking user:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function signUpUser(email: string, password: string): Promise<SignUpOutput> {
    try {
      console.log('AuthContext: Starting signUp for email:', email);
      const result = await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
          },
        },
      });
      console.log('AuthContext: SignUp successful:', result);
      return result;
    } catch (error) {
      console.error('AuthContext: SignUp error:', error);
      throw error;
    }
  }

  async function confirmSignUpUser(email: string, code: string): Promise<void> {
    try {
      console.log('AuthContext: Starting confirmSignUp for email:', email, 'with code:', code);
      const result = await confirmSignUp({
        username: email,
        confirmationCode: code,
      });
      console.log('AuthContext: ConfirmSignUp successful:', result);
    } catch (error) {
      console.error('AuthContext: ConfirmSignUp error:', error);
      throw error;
    }
  }

  async function signInUser(email: string, password: string): Promise<SignInOutput> {
    const result = await signIn({
      username: email,
      password,
    });
    await checkUser();
    return result;
  }

  async function signOutUser(): Promise<void> {
    await signOut();
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signUpUser,
        confirmSignUpUser,
        signInUser,
        signOutUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
