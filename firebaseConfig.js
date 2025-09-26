// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAwnZZzchJ7nzAsaotZJHHvUJQlvjR03KA",
  authDomain: "hungeraid-60fb6.firebaseapp.com",
  projectId: "hungeraid-60fb6",
  storageBucket: "hungeraid-60fb6.appspot.com",
  messagingSenderId: "735323954307",
  appId: "1:735323954307:web:212f7949e9e3b43f56cfb6",
  measurementId: "G-PDC7CD8VKH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export { app, firebaseConfig };

