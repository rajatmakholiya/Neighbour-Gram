document.addEventListener('DOMContentLoaded', () => {
    console.log('Neighborhood Board App Initialized!');

    const postForm = document.getElementById('create-post-form');
    const postContent = document.getElementById('post-content');
    const feedContainer = document.getElementById('feed-container');
    const attachLocationBtn = document.getElementById('attach-location');
    const locationDisplay = document.getElementById('location-display');
    const workerStatusSpan = document.getElementById('worker-status');
    const attachPhotoBtn = document.getElementById('attach-photo');
    const photoInput = document.getElementById('photo-input');
    const photoPreview = document.getElementById('photo-preview');

    let db;
    let capturedCoords = null;
    let capturedPhotoData = null;
    let userLikes = new Set();
    const DB_NAME = 'NeighborhoodBoardDB';
    const DB_VERSION = 2;
    let socket;

    function connectWebSocket() {
        socket = new WebSocket('ws://localhost:8080');

        socket.onopen = (event) => {
            console.log('WebSocket connection opened:', event);
        };

        socket.onmessage = (event) => {
            console.log('WebSocket message received:', event.data);
            const post = JSON.parse(event.data);
            renderPost(post);
        };

        socket.onclose = (event) => {
            console.log('WebSocket connection closed:', event);
            workerStatusSpan.textContent = '❌ Real-time updates disconnected. Retrying...';
            setTimeout(connectWebSocket, 5000);
        };

        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            workerStatusSpan.textContent = '❌ Connection Error';
        };
    }

    function initializeDB() {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains('posts')) {
                const postsStore = db.createObjectStore('posts', { keyPath: 'id', autoIncrement: true });
                postsStore.createIndex('createdAt', 'createdAt', { unique: false });
            }
            if (!db.objectStoreNames.contains('interactions')) {
                const interactionsStore = db.createObjectStore('interactions', { keyPath: 'id', autoIncrement: true });
                interactionsStore.createIndex('postId', 'postId', { unique: false });
                interactionsStore.createIndex('post_user_like', ['postId', 'userId'], { unique: true });
            } else {
                const interactionsStore = event.target.transaction.objectStore('interactions');
                if (!interactionsStore.indexNames.contains('post_user_like')) {
                    interactionsStore.createIndex('post_user_like', ['postId', 'userId'], { unique: true });
                }
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('Database opened successfully.');
            loadUserLikes().then(() => { addSampleData(); });
        };
        request.onerror = (event) => { console.error('Database error:', event.target.error); };
    }

    async function loadUserLikes() {
        if (!db) return;
        return new Promise((resolve) => {
            const transaction = db.transaction(['interactions'], 'readonly');
            const store = transaction.objectStore('interactions');
            const request = store.getAll();
            request.onsuccess = () => {
                userLikes.clear();
                const currentUser = 'current_user';
                request.result.forEach(interaction => {
                    if (interaction.type === 'like' && interaction.userId === currentUser) {
                        userLikes.add(interaction.postId);
                    }
                });
                resolve();
            };
        });
    }

    function renderPost(post) {
        const postElement = document.createElement('article');
        postElement.className = 'post';
        postElement.dataset.postId = post.id;
        const postDate = new Date(post.createdAt).toLocaleString();
        const isLiked = userLikes.has(post.id);
        const likeButtonClass = isLiked ? 'like-btn liked' : 'like-btn';
        const likeButtonText = isLiked ? 'Liked' : 'Like';
        
        let locationHTML = '';
        if (post.geolocation) {
            locationHTML = `<div class="post-location"><i class="fas fa-map-marker-alt"></i> Lat: ${post.geolocation.latitude.toFixed(4)}, Lon: ${post.geolocation.longitude.toFixed(4)}</div>`;
        }

        let imageHTML = '';
        if (post.imageData) {
            imageHTML = `<img src="${post.imageData}" alt="Post image" class="post-image">`;
        }

        postElement.innerHTML = `
            <div class="post-header"><img src="https://i.pravatar.cc/50?u=${post.userId}" alt="User Avatar" class="post-avatar"><div><span class="post-author">${post.userId}</span><span class="post-timestamp">${postDate}</span></div></div>
            <div class="post-body">
                <p>${post.content}</p>
                ${imageHTML}
            </div>
            ${locationHTML}
            <div class="post-footer">
                <button class="${likeButtonClass}" data-post-id="${post.id}"><i class="fas fa-thumbs-up"></i> ${likeButtonText}</button>
                <button class="comment-btn"><i class="fas fa-comment"></i> Comment</button>
                <button class="react-btn"><i class="fas fa-smile"></i> React</button>
            </div>
        `;
        feedContainer.prepend(postElement);
    }

    function displayFeed() {
        if (!db) return;
        const transaction = db.transaction(['posts'], 'readonly');
        const objectStore = transaction.objectStore('posts');
        const index = objectStore.index('createdAt');
        feedContainer.innerHTML = '';
        index.openCursor(null, 'prev').onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                renderPost(cursor.value);
                cursor.continue();
            }
        };
    }
    
    function addSampleData() {
        if (!db) return;
        const transaction = db.transaction(['posts'], 'readwrite');
        const objectStore = transaction.objectStore('posts');
        const countRequest = objectStore.count();
        countRequest.onsuccess = () => {
            if (countRequest.result === 0) {
                // sample data can go here if you clear your DB
            }
        };
        transaction.oncomplete = () => { displayFeed(); };
    }

    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register(new URL('./sw.js', import.meta.url))
                .then((registration) => {
                    console.log('Service Worker registered with scope:', registration.scope);
                }).catch((error) => {
                    console.error('Service Worker registration failed:', error);
                    workerStatusSpan.textContent = 'Registration Failed';
                });

            navigator.serviceWorker.addEventListener('message', event => {
                if (event.data && event.data.type === 'SW_STATUS') {
                    const currentStatus = workerStatusSpan.textContent;
                    if (!currentStatus.includes('Real-time')) {
                         workerStatusSpan.textContent = event.data.payload;
                    }
                }
            });
        } else {
            workerStatusSpan.textContent = 'Not Supported';
        }
    }

    async function toggleLike(postId) {
        const userId = 'current_user';
        const transaction = db.transaction(['interactions'], 'readwrite');
        const store = transaction.objectStore('interactions');
        const index = store.index('post_user_like');
        const request = index.get([postId, userId]);
        return new Promise((resolve) => {
            request.onsuccess = () => {
                const existingInteraction = request.result;
                if (existingInteraction) {
                    store.delete(existingInteraction.id);
                    userLikes.delete(postId);
                    resolve(false);
                } else {
                    store.add({ postId, userId, type: 'like' });
                    userLikes.add(postId);
                    resolve(true);
                }
            };
        });
    }

    function addPost(post) {
        if (!db) return;
        const transaction = db.transaction(['posts'], 'readwrite');
        const objectStore = transaction.objectStore('posts');
        const request = objectStore.add(post);

        request.onsuccess = (event) => {
            const newPostWithId = { ...post, id: event.target.result };
            renderPost(newPostWithId);
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify(newPostWithId));
            }
        };
    }

    feedContainer.addEventListener('click', async (event) => {
        const likeButton = event.target.closest('.like-btn');
        if (likeButton) {
            const postId = parseInt(likeButton.dataset.postId);
            const isNowLiked = await toggleLike(postId);
            if (isNowLiked) {
                likeButton.classList.add('liked');
                likeButton.innerHTML = '<i class="fas fa-thumbs-up"></i> Liked';
            } else {
                likeButton.classList.remove('liked');
                likeButton.innerHTML = '<i class="fas fa-thumbs-up"></i> Like';
            }
        }
    });
    
    attachPhotoBtn.addEventListener('click', () => {
        photoInput.click();
    });

    photoInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            capturedPhotoData = e.target.result;
            photoPreview.innerHTML = `<img src="${capturedPhotoData}" alt="Image preview">`;
        };
        reader.readAsDataURL(file);
    });

    attachLocationBtn.addEventListener('click', () => {
        if (!navigator.geolocation) return;
        locationDisplay.textContent = 'Getting location...';
        navigator.geolocation.getCurrentPosition(
            (position) => {
                locationDisplay.textContent = '✅ Location captured!';
                capturedCoords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
            },
            () => { locationDisplay.textContent = 'Unable to retrieve location.'; }
        );
    });

    postForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const content = postContent.value.trim();
        if (!content && !capturedPhotoData) {
            alert('A post must have text or an image.');
            return;
        }
        
        const newPost = { 
            userId: 'current_user', 
            content: content, 
            createdAt: new Date().getTime(), 
            geolocation: capturedCoords,
            imageData: capturedPhotoData
        };

        addPost(newPost);
        postForm.reset();
        capturedCoords = null;
        capturedPhotoData = null;
        locationDisplay.textContent = '';
        photoPreview.innerHTML = '';
    });

    initializeDB();
    registerServiceWorker();
    connectWebSocket();
});
