import { useEffect, useState } from 'react';
import { addDoc, arrayUnion, collection, doc, getFirestore, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';

/**
 * Custom hook for real-time Firestore posts feed.
 * Subscribes to the 'posts' collection ordered by timestamp (newest first).
 */
export function usePosts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestore();
    const q = query(collection(db, 'posts'), orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));
      setPosts(data);
      setLoading(false);
    }, (error) => {
      console.error('Posts feed listener error:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  /**
   * Create a new post in Firestore
   * @param {Object} params - { userName, message, role, userId }
   */
  const createPost = async ({ userName, message, role, userId }) => {
    const db = getFirestore();
    await addDoc(collection(db, 'posts'), {
      userName: userName || 'Anonymous',
      message,
      role: role || 'User',
      userId: userId || null,
      comments: [],
      timestamp: serverTimestamp(),
    });
  };

  /**
   * Add a comment to an existing post
   * @param {string} postId - Firestore document ID
   * @param {string} authorName - Comment author name
   * @param {string} text - Comment text
   */
  const addComment = async (postId, authorName, text) => {
    const db = getFirestore();
    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, {
      comments: arrayUnion({
        author: authorName,
        text,
        createdAt: new Date().toISOString(),
      }),
    });
  };

  return { posts, loading, createPost, addComment };
}
