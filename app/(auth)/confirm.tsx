import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/auth-context';
import { resendSignUpCode } from 'aws-amplify/auth';

export default function ConfirmScreen() {
  const { email, password } = useLocalSearchParams<{ email: string; password: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const { confirmSignUpUser, signInUser } = useAuth();

  async function handleConfirm() {
    if (!code) {
      Alert.alert('Error', 'Please enter the verification code');
      return;
    }

    setLoading(true);
    try {
      console.log('Confirm screen: Attempting to confirm with email:', email, 'code:', code);
      await confirmSignUpUser(email, code);
      console.log('Confirmation successful, now signing in...');

      // Auto-login after successful confirmation
      await signInUser(email, password);
      console.log('Sign in successful, redirecting to home...');

      // Redirect to home screen
      router.replace('/(tabs)');
    } catch (error: any) {
      console.error('Confirm screen error:', error);
      const errorMessage = error.message || error.toString() || 'Failed to verify email';
      Alert.alert('Verification Error', errorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    setResending(true);
    try {
      console.log('Resending code to:', email);
      await resendSignUpCode({ username: email });
      Alert.alert('Success', 'Verification code sent! Check your email.');
    } catch (error: any) {
      console.error('Resend code error:', error);
      Alert.alert('Error', error.message || 'Failed to resend code');
    } finally {
      setResending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ThemedView style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Verify Email
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          We sent a verification code to {email}
        </ThemedText>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Verification Code"
            placeholderTextColor="#999"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            editable={!loading}
          />
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleConfirm}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.buttonText}>Verify</ThemedText>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleResendCode}
          disabled={loading || resending}
          style={styles.resendButton}
        >
          {resending ? (
            <ActivityIndicator color="#007AFF" size="small" />
          ) : (
            <ThemedText style={styles.linkText}>Resend Code</ThemedText>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} disabled={loading}>
          <ThemedText style={styles.linkText}>Back to Sign Up</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 32,
    textAlign: 'center',
    opacity: 0.7,
  },
  inputContainer: {
    gap: 16,
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    textAlign: 'center',
    letterSpacing: 8,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#007AFF',
  },
  resendButton: {
    marginBottom: 16,
  },
});
