import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, initializeFirestore } from 'firebase/firestore';

// Fallback dynamic configuration which allows environment variables
const metaEnv = (import.meta as any).env || {};

const isSandbox = !metaEnv.VITE_FIREBASE_PROJECT_ID || 
  typeof metaEnv.VITE_FIREBASE_PROJECT_ID !== 'string' || 
  metaEnv.VITE_FIREBASE_PROJECT_ID.trim() === "" || 
  metaEnv.VITE_FIREBASE_PROJECT_ID === "gen-lang-client-0306059686";
const defaultDatabaseId = isSandbox ? "ai-studio-dcde57ba-6a05-4ae3-b957-9bafc9cbd399" : undefined;

const getEnvValue = (val: any, fallback: string) => {
  return (val && typeof val === "string" && val.trim() !== "") ? val : fallback;
};

const firebaseConfig = {
  apiKey: getEnvValue(metaEnv.VITE_FIREBASE_API_KEY, "AIzaSyCSeI3Pz0oZXeztYYwV9je5Ya-3uumFENE"),
  authDomain: getEnvValue(metaEnv.VITE_FIREBASE_AUTH_DOMAIN, "gen-lang-client-0306059686.firebaseapp.com"),
  projectId: getEnvValue(metaEnv.VITE_FIREBASE_PROJECT_ID, "gen-lang-client-0306059686"),
  storageBucket: getEnvValue(metaEnv.VITE_FIREBASE_STORAGE_BUCKET, "gen-lang-client-0306059686.firebasestorage.app"),
  messagingSenderId: getEnvValue(metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID, "868754084635"),
  appId: getEnvValue(metaEnv.VITE_FIREBASE_APP_ID, "1:868754084635:web:7481919fca63f42a13b9be"),
  firestoreDatabaseId: (metaEnv.VITE_FIREBASE_DATABASE_ID && typeof metaEnv.VITE_FIREBASE_DATABASE_ID === "string" && metaEnv.VITE_FIREBASE_DATABASE_ID.trim() !== "") 
    ? metaEnv.VITE_FIREBASE_DATABASE_ID 
    : defaultDatabaseId,
};

let app;
try {
  app = initializeApp(firebaseConfig);
} catch (error) {
  console.error("Firebase App initialization failed:", error);
}

let dbInstance: any;
try {
  if (firebaseConfig.firestoreDatabaseId) {
    dbInstance = initializeFirestore(app, {
      experimentalForceLongPolling: true,
    }, firebaseConfig.firestoreDatabaseId);
  } else {
    dbInstance = initializeFirestore(app, {
      experimentalForceLongPolling: true,
    });
  }
} catch (error) {
  console.error("initializeFirestore failed, falling back to getFirestore:", error);
  try {
    dbInstance = getFirestore(app);
  } catch (err) {
    console.error("getFirestore failed as well:", err);
    // Create a mock db instance to avoid breaking the bundle's export references
    dbInstance = {
      _isMock: true,
    };
  }
}

let authInstance: any;
try {
  authInstance = getAuth(app);
} catch (error) {
  console.error("getAuth failed:", error);
  authInstance = {
    _isMock: true,
  };
}

export const db = dbInstance;
export const auth = authInstance;
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

testConnection();

export const login = () => signInWithPopup(auth, googleProvider);
export const logout = () => signOut(auth);
