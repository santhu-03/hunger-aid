import { useState } from 'react';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { analyzeFoodQuality } from '../services/GeminiFoodAssessmentService';
import { app } from '../firebaseConfig';
import * as FileSystem from 'expo-file-system/legacy';
import { uploadImage, storagePaths } from '../services/storageService';

const imageToBase64 = async (uri) => {
  if (!uri) throw new Error('Image URI is required.');
  const base64Encoding = FileSystem?.EncodingType?.Base64 || 'base64';
  return FileSystem.readAsStringAsync(uri, { encoding: base64Encoding });
};

export function useFoodQualityAssessment() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const assessQuality = async (imagesUris, inputValues) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      if (!imagesUris || imagesUris.length === 0) {
        throw new Error('At least one image is required for assessment.');
      }

      // Convert all images to base64
      const base64Images = await Promise.all(
        imagesUris.map(uri => imageToBase64(uri))
      );

      // Call the service
      const assessmentResult = await analyzeFoodQuality({ base64Images, inputValues });

      setResult(assessmentResult);

      // Upload assessment images to Firebase Storage (best-effort; failures don't block the save)
      const sessionId = Date.now().toString();
      const uploadResults = await Promise.allSettled(
        imagesUris.map((uri, idx) =>
          uploadImage(uri, storagePaths.assessmentImage(sessionId, idx))
        )
      );
      const storedImageUrls = uploadResults
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);

      // Save to Firestore
      const db = getFirestore(app);
      await addDoc(collection(db, 'foodQualityAssessments'), {
        inputValues,
        aiAssessment: assessmentResult,
        imageUrls: storedImageUrls,
        createdAt: serverTimestamp(),
      });

      return assessmentResult;
    } catch (err) {
      setError(err.message || 'An error occurred during quality assessment.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    result,
    assessQuality,
  };
}
