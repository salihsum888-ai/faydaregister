'use client';
import {
  Auth,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { toast } from '@/hooks/use-toast';

/** Initiate anonymous sign-in (non-blocking). */
export function initiateAnonymousSignIn(authInstance: Auth) {
  return signInAnonymously(authInstance).catch((error) => {
    console.error("Anonymous sign-in failed:", error);
    toast({
      title: "Connection Failed",
      description: "Could not establish a guest session.",
      variant: "destructive",
    });
    throw error;
  });
}

/** Initiate email/password sign-up (non-blocking). */
export function initiateEmailSignUp(authInstance: Auth, email: string, password: string) {
  return createUserWithEmailAndPassword(authInstance, email, password).catch((error) => {
    console.error("Sign-up failed:", error);
    toast({
      title: "Registration Failed",
      description: error.message || "Could not create account.",
      variant: "destructive",
    });
    throw error;
  });
}

/** Initiate email/password sign-in (non-blocking). */
export function initiateEmailSignIn(authInstance: Auth, email: string, password: string) {
  return signInWithEmailAndPassword(authInstance, email, password).catch((error) => {
    console.error("Sign-in failed:", error);
    let message = "Please check your credentials and try again.";
    if (error.code === 'auth/invalid-credential') {
      message = "Invalid email or password.";
    } else if (error.code === 'auth/user-not-found') {
      message = "No account found with this email.";
    }
    
    toast({
      title: "Sign In Failed",
      description: message,
      variant: "destructive",
    });
    throw error;
  });
}
