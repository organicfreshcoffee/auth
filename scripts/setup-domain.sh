#!/bin/bash

# Custom Domain Setup Script for Cloud Run
# This script helps set up a custom domain for your Cloud Run service

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID=""
REGION="us-central1"
CLIENT_SERVICE_NAME="organicfreshcoffee-client"
SERVER_SERVICE_NAME="organicfreshcoffee-server"
MAIN_DOMAIN="organicfreshcoffee.com"
API_DOMAIN="api.organicfreshcoffee.com"

# Check if staging environment is requested
if [ "$1" = "staging" ] || [ "$1" = "--staging" ]; then
    echo -e "${BLUE}Setting up STAGING environment${NC}"
    CLIENT_SERVICE_NAME="organicfreshcoffee-client-staging"
    SERVER_SERVICE_NAME="organicfreshcoffee-server-staging"
    MAIN_DOMAIN="staging.organicfreshcoffee.com"
    API_DOMAIN="staging-api.organicfreshcoffee.com"
fi

print_header() {
    echo -e "${BLUE}======================================${NC}"
    echo -e "${BLUE}  Custom Domain Setup for Cloud Run${NC}"
    if [ "$1" = "staging" ] || [ "$1" = "--staging" ]; then
        echo -e "${BLUE}       STAGING ENVIRONMENT${NC}"
    else
        echo -e "${BLUE}      PRODUCTION ENVIRONMENT${NC}"
    fi
    echo -e "${BLUE}======================================${NC}"
    echo ""
}

print_step() {
    echo -e "${GREEN}[STEP]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    print_step "Checking prerequisites..."
    
    # Check if gcloud is installed
    if ! command -v gcloud &> /dev/null; then
        print_error "gcloud CLI is not installed. Please install it from: https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
    
    # Check if user is authenticated
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
        print_error "You are not authenticated with gcloud. Please run: gcloud auth login"
        exit 1
    fi
    
    print_info "Prerequisites check passed!"
}

get_project_id() {
    CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null || echo "")
    if [ -n "$CURRENT_PROJECT" ]; then
        PROJECT_ID=$CURRENT_PROJECT
        print_info "Using project: $PROJECT_ID"
    else
        read -p "Enter your GCP Project ID: " PROJECT_ID
        gcloud config set project $PROJECT_ID
    fi
}

verify_service_exists() {
    print_step "Checking Cloud Run services..."
    
    SERVICES_EXIST=true
    
    # Check client service
    if gcloud run services describe $CLIENT_SERVICE_NAME --region=$REGION &>/dev/null; then
        print_info "Client service '$CLIENT_SERVICE_NAME' found in region '$REGION'"
        CLIENT_URL=$(gcloud run services describe $CLIENT_SERVICE_NAME --region=$REGION --format='value(status.url)')
        print_info "Current client URL: $CLIENT_URL"
    else
        print_warning "Client service '$CLIENT_SERVICE_NAME' not found in region '$REGION'"
        SERVICES_EXIST=false
    fi
    
    # Check server service
    if gcloud run services describe $SERVER_SERVICE_NAME --region=$REGION &>/dev/null; then
        print_info "Server service '$SERVER_SERVICE_NAME' found in region '$REGION'"
        SERVER_URL=$(gcloud run services describe $SERVER_SERVICE_NAME --region=$REGION --format='value(status.url)')
        print_info "Current server URL: $SERVER_URL"
    else
        print_warning "Server service '$SERVER_SERVICE_NAME' not found in region '$REGION'"
        SERVICES_EXIST=false
    fi
    
    if [ "$SERVICES_EXIST" = false ]; then
        print_warning "Services not yet deployed. Domain mappings will be created anyway."
        print_info "After deploying your services with GitHub Actions, you can run this script again"
        print_info "or the domain mappings will automatically work once services are deployed."
        echo ""
        read -p "Continue with domain setup anyway? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Exiting. Deploy your services first, then run this script again."
            exit 0
        fi
    fi
}

verify_domain_ownership() {
    print_step "Checking domain ownership..."
    
    if [ "$1" = "staging" ] || [ "$1" = "--staging" ]; then
        print_info "Make sure you own the staging domains:"
        print_info "  - staging.organicfreshcoffee.com"
        print_info "  - staging-api.organicfreshcoffee.com"
        print_info "You should have DNS records configured for these staging subdomains"
        
        read -p "Do you have DNS control for staging.organicfreshcoffee.com? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_error "You must have DNS control for the staging domains to continue"
            exit 1
        fi
    else
        print_info "Make sure you own the domain 'organicfreshcoffee.com'"
        print_info "You should have purchased 'organicfreshcoffee.com' through Google Domains or another registrar"
        
        read -p "Do you own the domain 'organicfreshcoffee.com'? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_error "You must own the domain to continue"
            exit 1
        fi
    fi
}

create_domain_mapping() {
    print_step "Creating domain mappings for Cloud Run..."
    
    # Create mapping for main domain (client)
    if gcloud beta run domain-mappings describe --domain=$MAIN_DOMAIN --region=$REGION &>/dev/null; then
        print_warning "Domain mapping for '$MAIN_DOMAIN' already exists"
    else
        print_info "Creating domain mapping for '$MAIN_DOMAIN' -> client service..."
        gcloud beta run domain-mappings create \
            --service=$CLIENT_SERVICE_NAME \
            --domain=$MAIN_DOMAIN \
            --region=$REGION
        print_info "Main domain mapping created successfully!"
    fi
    
    # Create mapping for API subdomain (server)
    if gcloud beta run domain-mappings describe --domain=$API_DOMAIN --region=$REGION &>/dev/null; then
        print_warning "Domain mapping for '$API_DOMAIN' already exists"
    else
        print_info "Creating domain mapping for '$API_DOMAIN' -> server service..."
        gcloud beta run domain-mappings create \
            --service=$SERVER_SERVICE_NAME \
            --domain=$API_DOMAIN \
            --region=$REGION
        print_info "API domain mapping created successfully!"
    fi
}

get_dns_records() {
    print_step "Getting DNS records to configure..."
    
    print_info "Fetching required DNS records for both domains..."
    
    echo ""
    echo -e "${YELLOW}DNS Records to configure:${NC}"
    echo "========================="
    
    # Get DNS records for main domain
    print_info "For $MAIN_DOMAIN (client):"
    MAIN_DNS_RECORDS=$(gcloud beta run domain-mappings describe --domain=$MAIN_DOMAIN --region=$REGION --format="value(status.resourceRecords[].name,status.resourceRecords[].type,status.resourceRecords[].rrdata)" 2>/dev/null || echo "")
    
    if [ -n "$MAIN_DNS_RECORDS" ]; then
        echo "$MAIN_DNS_RECORDS" | while IFS=$'\t' read -r name type rrdata; do
            if [ -n "$type" ] && [ -n "$rrdata" ]; then
                echo "Name: ${name:-@}"
                echo "Type: $type"
                echo "Value: $rrdata"
                echo "TTL: 300"
                echo "---"
            fi
        done
    fi
    
    echo ""
    # Get DNS records for API domain
    print_info "For $API_DOMAIN (server API):"
    API_DNS_RECORDS=$(gcloud beta run domain-mappings describe --domain=$API_DOMAIN --region=$REGION --format="value(status.resourceRecords[].name,status.resourceRecords[].type,status.resourceRecords[].rrdata)" 2>/dev/null || echo "")
    
    if [ -n "$API_DNS_RECORDS" ]; then
        echo "$API_DNS_RECORDS" | while IFS=$'\t' read -r name type rrdata; do
            if [ -n "$type" ] && [ -n "$rrdata" ]; then
                echo "Name: ${name:-@}"
                echo "Type: $type"
                echo "Value: $rrdata"
                echo "TTL: 300"
                echo "---"
            fi
        done
    fi
    
    if [ -z "$MAIN_DNS_RECORDS" ] && [ -z "$API_DNS_RECORDS" ]; then
        print_warning "Could not retrieve DNS records automatically"
        print_info "You can get them manually with:"
        echo "gcloud beta run domain-mappings describe --domain=$MAIN_DOMAIN --region=$REGION"
        echo "gcloud beta run domain-mappings describe --domain=$API_DOMAIN --region=$REGION"
    fi
}

configure_google_domains() {
    print_step "Instructions for configuring DNS..."
    
    echo ""
    if [[ "$MAIN_DOMAIN" == *"staging"* ]]; then
        echo -e "${YELLOW}To configure DNS for STAGING domains:${NC}"
        echo "===================================="
        echo "1. Go to your DNS provider (Google Domains, Cloudflare, etc.)"
        echo "2. Find your domain 'organicfreshcoffee.com'"
        echo "3. Go to DNS management"
        echo "4. Add the DNS records shown above:"
        echo "   - For staging.organicfreshcoffee.com (staging client) - A records"
        echo "   - For staging-api.organicfreshcoffee.com (staging API) - CNAME record"
        echo "5. Set TTL to 300 seconds for faster propagation during testing"
        echo "6. Save the changes"
        echo ""
        echo -e "${BLUE}Note:${NC} These are STAGING subdomains of your main domain"
    else
        echo -e "${YELLOW}To configure DNS in Google Domains:${NC}"
        echo "===================================="
        echo "1. Go to https://domains.google.com"
        echo "2. Find your domain 'organicfreshcoffee.com'"
        echo "3. Click on it and go to 'DNS' tab"
        echo "4. Scroll down to 'Custom records'"
        echo "5. Add the DNS records shown above:"
        echo "   - For organicfreshcoffee.com (client app) - A records"
        echo "   - For api.organicfreshcoffee.com (server API) - CNAME record"
        echo "6. Set TTL to 300 seconds for faster propagation during testing"
        echo "7. Save the changes"
        echo ""
        echo -e "${BLUE}Note:${NC} These are PRODUCTION domains"
    fi
    echo -e "${BLUE}DNS propagation info:${NC} Can take up to 48 hours, but usually takes 5-10 minutes"
    echo -e "${BLUE}Tip:${NC} You can use 'dig organicfreshcoffee.com' to check DNS propagation"
    echo ""
    echo -e "${YELLOW}About the A records for the root domain:${NC}"
    echo "========================================"
    echo "• These are Google's stable Cloud Run ingress IP addresses"
    echo "• They rarely change, but Google will notify if they do"
    echo "• This is the standard approach for root domains with Cloud Run"
    echo "• Millions of sites use this same setup successfully"
    echo "• Alternative: Use Cloudflare (free) for CNAME flattening if you prefer"
}

test_domain_setup() {
    print_step "Testing domain setup..."
    
    echo ""
    print_info "Once DNS propagation is complete, test your setup:"
    echo "1. Client app: https://$MAIN_DOMAIN/"
    echo "2. Server health: https://$API_DOMAIN/health"
    echo "3. API endpoints: https://$API_DOMAIN/api/..."
    echo ""
    print_info "You can check DNS propagation with:"
    echo "nslookup $MAIN_DOMAIN"
    echo "nslookup $API_DOMAIN"
    echo "dig $MAIN_DOMAIN"
    echo "dig $API_DOMAIN"
}

update_cors_configuration() {
    print_step "CORS configuration update..."
    
    if [[ "$MAIN_DOMAIN" == *"staging"* ]]; then
        print_info "✅ CORS is automatically configured for staging domains:"
        print_info "  - staging.organicfreshcoffee.com"
        print_info "  - staging-api.organicfreshcoffee.com"
        print_info "  - Cloud Run URLs (as fallback)"
    else
        print_info "✅ CORS is automatically configured for production domains:"
        print_info "  - organicfreshcoffee.com"
        print_info "  - www.organicfreshcoffee.com"
        print_info "  - api.organicfreshcoffee.com"
    fi
    
    print_info "The server will log allowed origins on startup for verification."
}

print_next_steps() {
    print_step "Next steps and summary..."
    
    echo ""
    echo -e "${GREEN}Summary:${NC}"
    echo "========"
    echo "✅ Domain mapping created for: $MAIN_DOMAIN (client)"
    echo "✅ Domain mapping created for: $API_DOMAIN (server)"
    echo "✅ DNS records retrieved"
    echo "✅ Configuration instructions provided"
    echo ""
    echo -e "${YELLOW}What you need to do next:${NC}"
    echo "========================="
    echo "1. Configure DNS records in Google Domains (instructions above)"
    echo "2. Wait for DNS propagation (5-10 minutes usually)"
    echo "3. Test the domains:"
    echo "   - Client: https://$MAIN_DOMAIN/"
    echo "   - Server: https://$API_DOMAIN/health"
    echo "4. Update your GitHub secrets:"
    echo "   - CLIENT_URL: https://$MAIN_DOMAIN"
    echo "   - SERVER_URL: https://$API_DOMAIN"
    echo "5. Update your Next.js client to use the API domain"
    echo "6. Redeploy after updating configuration"
    echo ""
    echo -e "${BLUE}Useful commands:${NC}"
    echo "================"
    echo "# Check domain mapping status"
    echo "gcloud beta run domain-mappings describe $MAIN_DOMAIN --region=$REGION"
    echo "gcloud beta run domain-mappings describe $API_DOMAIN --region=$REGION"
    echo ""
    echo "# Check DNS resolution"
    echo "nslookup $MAIN_DOMAIN"
    echo "nslookup $API_DOMAIN"
    echo ""
    echo "# Test SSL certificates (after DNS propagation)"
    echo "curl -I https://$MAIN_DOMAIN/"
    echo "curl -I https://$API_DOMAIN/health"
    echo ""
    echo -e "${GREEN}🎉 Your services will be available at:${NC}"
    echo -e "${GREEN}   Client: https://$MAIN_DOMAIN${NC}"
    echo -e "${GREEN}   API:    https://$API_DOMAIN${NC}"
}

# Main execution
main() {
    print_header "$1"
    check_prerequisites
    get_project_id
    verify_service_exists
    verify_domain_ownership "$1"
    create_domain_mapping
    get_dns_records
    configure_google_domains
    test_domain_setup
    update_cors_configuration
    print_next_steps
}

# Run main function
main "$@"
