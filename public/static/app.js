// Art Bank Core - Main Application JavaScript
// Role-specific dashboards and API interactions

const API_BASE = window.location.origin + '/api';

// Utility function to make API calls
async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(API_BASE + endpoint, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

// Role navigation
function navigateToRole(role) {
    window.location.href = `/dashboard/${role}`;
}

// Artist Dashboard Functions
class ArtistDashboard {
    constructor(artistId) {
        this.artistId = artistId;
    }
    
    async loadProfile() {
        const data = await apiCall(`/artist/profile/${this.artistId}`);
        return data;
    }
    
    async loadArtworks() {
        const data = await apiCall(`/artist/artworks?artist_id=${this.artistId}`);
        return data.artworks;
    }
    
    async createArtwork(artworkData) {
        return await apiCall('/artist/artworks', {
            method: 'POST',
            body: JSON.stringify(artworkData)
        });
    }
    
    async loadAnalytics() {
        const data = await apiCall(`/artist/analytics?artist_id=${this.artistId}`);
        return data;
    }
}

// Collector Dashboard Functions
class CollectorDashboard {
    constructor(collectorId) {
        this.collectorId = collectorId;
    }
    
    async loadProfile() {
        const data = await apiCall(`/collector/profile/${this.collectorId}`);
        return data;
    }
    
    async loadMarketplace(filters = {}) {
        let query = '';
        if (filters.style) query += `&style=${filters.style}`;
        if (filters.maxPrice) query += `&max_price=${filters.maxPrice}`;
        
        const data = await apiCall(`/collector/marketplace?${query}`);
        return data.artworks;
    }
    
    async initiatePurchase(purchaseData) {
        return await apiCall('/collector/purchase', {
            method: 'POST',
            body: JSON.stringify(purchaseData)
        });
    }
}

// Gallery Dashboard Functions
class GalleryDashboard {
    constructor(galleryId) {
        this.galleryId = galleryId;
    }
    
    async loadProfile() {
        const data = await apiCall(`/gallery/profile/${this.galleryId}`);
        return data;
    }
    
    async loadExhibitions() {
        const data = await apiCall(`/gallery/exhibitions?gallery_id=${this.galleryId}`);
        return data.exhibitions;
    }
    
    async createExhibition(exhibitionData) {
        return await apiCall('/gallery/exhibitions', {
            method: 'POST',
            body: JSON.stringify(exhibitionData)
        });
    }
}

// Bank Dashboard Functions
class BankDashboard {
    constructor(bankId) {
        this.bankId = bankId;
    }
    
    async loadProfile() {
        const data = await apiCall(`/bank/profile/${this.bankId}`);
        return data;
    }
    
    async approveTransaction(transactionId, status, reason) {
        return await apiCall(`/bank/transactions/${transactionId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status, reason })
        });
    }
}

// Expert Dashboard Functions
class ExpertDashboard {
    constructor(expertId) {
        this.expertId = expertId;
    }
    
    async loadProfile() {
        const data = await apiCall(`/expert/profile/${this.expertId}`);
        return data;
    }
    
    async submitValidation(validationData) {
        return await apiCall('/expert/validations', {
            method: 'POST',
            body: JSON.stringify(validationData)
        });
    }
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 0
    }).format(amount);
}

// Format date
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Toast notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg ${
        type === 'success' ? 'bg-green-500' :
        type === 'error' ? 'bg-red-500' :
        'bg-blue-500'
    } text-white z-50`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Export for use in other scripts
window.ArtBank = {
    apiCall,
    navigateToRole,
    ArtistDashboard,
    CollectorDashboard,
    GalleryDashboard,
    BankDashboard,
    ExpertDashboard,
    formatCurrency,
    formatDate,
    showToast
};
