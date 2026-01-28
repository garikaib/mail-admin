"""
Security Middleware for CSP Nonces and Headers
"""
import secrets
from django.utils.deprecation import MiddlewareMixin


class CSPNonceMiddleware(MiddlewareMixin):
    """
    Adds a CSP nonce to each request and sets Content-Security-Policy header.
    Usage in templates: <script nonce="{{ request.csp_nonce }}">
    """
    
    def process_request(self, request):
        # Generate a unique nonce for each request
        request.csp_nonce = secrets.token_urlsafe(16)
    
    def process_response(self, request, response):
        nonce = getattr(request, 'csp_nonce', '')
        
        # Build CSP directives
        csp_directives = [
            "default-src 'self'",
            f"script-src 'self' 'nonce-{nonce}' https://unpkg.com https://cdn.tailwindcss.com https://challenges.cloudflare.com",
            f"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://challenges.cloudflare.com",  # Tailwind needs inline styles
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data:",
            "connect-src 'self' https://challenges.cloudflare.com",  # For Turnstile
            "frame-src https://challenges.cloudflare.com",  # For Turnstile iframe
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ]
        
        csp_header = "; ".join(csp_directives)
        response['Content-Security-Policy'] = csp_header
        
        return response
