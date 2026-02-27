import numpy as np
from scipy.stats import norm

def black_scholes_gamma(S, K, T, r, sigma):
    """
    Vectorized Black-Scholes Gamma calculation.
    Supports both scalar and array inputs.
    """
    S = np.array(S)
    K = np.array(K)
    T = np.array(T)
    sigma = np.array(sigma)
    
    # Handle edge cases (T <= 0 or sigma <= 0)
    mask = (T > 0) & (sigma > 0)
    gamma = np.zeros_like(S, dtype=float)
    
    if not np.any(mask):
        return gamma if S.shape else float(gamma)

    S_m, K_m, T_m, sigma_m = S[mask], K[mask], T[mask], sigma[mask]
    
    d1 = (np.log(S_m / K_m) + (r + 0.5 * sigma_m**2) * T_m) / (sigma_m * np.sqrt(T_m))
    gamma[mask] = norm.pdf(d1) / (S_m * sigma_m * np.sqrt(T_m))
    
    if S.ndim == 0:
        return float(gamma)
    return gamma

def calculate_gamma_impact(spot, strike, expiry_days, iv, size):
    """
    Returns the Delta-equivalent Gamma impact of a trade.
    Optimized for speed via NumPy.
    """
    T = np.array(expiry_days) / 365.0
    sigma = np.array(iv) / 100.0
    
    # Crypto norm for options: r = 0.0
    g = black_scholes_gamma(spot, strike, T, 0.0, sigma)
    
    # GEX = Gamma * Spot * Size * 0.01 (1% move)
    gex = g * size * spot * 0.01
    
    if np.isscalar(gex):
        return float(round(float(gex), 6))
    return np.round(gex, 6).tolist()
