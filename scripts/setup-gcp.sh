#!/bin/bash

# GCP Deployment Setup Script
# This script helps set up the necessary GCP resources for deploying the game server

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
SERVICE_ACCOUNT_NAME="github-actions-sa"
REPOSITORY_NAME="organicfreshcoffee"

print_header() {
    echo -e "${BLUE}======================================${NC}"
    echo -e "${BLUE}  GCP Deployment Setup for Landing App${NC}"
    echo -e "${BLUE}  Client + Server Architecture${NC}"
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
    if [ -z "$PROJECT_ID" ]; then
        CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null || echo "")
        if [ -n "$CURRENT_PROJECT" ]; then
            echo -e "Current project: ${GREEN}$CURRENT_PROJECT${NC}"
            read -p "Use this project? (y/n): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                PROJECT_ID=$CURRENT_PROJECT
            fi
        fi
        
        if [ -z "$PROJECT_ID" ]; then
            read -p "Enter your GCP Project ID: " PROJECT_ID
        fi
    fi
    
    # Set the project
    gcloud config set project $PROJECT_ID
    print_info "Using project: $PROJECT_ID"
}

enable_apis() {
    print_step "Enabling required APIs..."
    
    gcloud services enable run.googleapis.com
    gcloud services enable artifactregistry.googleapis.com
    gcloud services enable cloudbuild.googleapis.com
    gcloud services enable iam.googleapis.com
    gcloud services enable cloudresourcemanager.googleapis.com
    
    print_info "APIs enabled successfully!"
}

create_artifact_registry() {
    print_step "Creating Artifact Registry repository..."
    
    # Check if repository already exists
    if gcloud artifacts repositories describe $REPOSITORY_NAME --location=$REGION &>/dev/null; then
        print_warning "Repository $REPOSITORY_NAME already exists in $REGION"
    else
        gcloud artifacts repositories create $REPOSITORY_NAME \
            --repository-format=docker \
            --location=$REGION \
            --description="Organic Fresh Coffee container images"
        print_info "Artifact Registry repository created!"
    fi
}

create_service_account() {
    print_step "Creating service account for GitHub Actions..."
    
    # Check if service account already exists
    if gcloud iam service-accounts describe "${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" &>/dev/null; then
        print_warning "Service account $SERVICE_ACCOUNT_NAME already exists"
    else
        gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
            --display-name="GitHub Actions Service Account"
        print_info "Service account created!"
    fi
    
    # Grant necessary permissions
    print_info "Granting permissions to service account..."
    
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/run.admin"
    
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/artifactregistry.writer"
    
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/iam.serviceAccountUser"
}

setup_workload_identity() {
    print_step "Setting up Workload Identity Federation..."
    
    # Create workload identity pool
    if gcloud iam workload-identity-pools describe "github-actions-pool" --location="global" &>/dev/null; then
        print_warning "Workload identity pool already exists"
    else
        gcloud iam workload-identity-pools create "github-actions-pool" \
            --location="global" \
            --display-name="GitHub Actions Pool"
        print_info "Workload identity pool created!"
    fi
    
    # Create workload identity provider
    if gcloud iam workload-identity-pools providers describe "github-actions-provider" \
        --location="global" \
        --workload-identity-pool="github-actions-pool" &>/dev/null; then
        print_warning "Workload identity provider already exists"
    else
        gcloud iam workload-identity-pools providers create-oidc "github-actions-provider" \
            --location="global" \
            --workload-identity-pool="github-actions-pool" \
            --display-name="GitHub Actions Provider" \
            --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
            --attribute-condition="assertion.repository_owner == 'organicfreshcoffee'" \
            --issuer-uri="https://token.actions.githubusercontent.com"
        print_info "Workload identity provider created!"
    fi
    
    # Get project number
    PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
    
    # Allow GitHub Actions to impersonate the service account
    gcloud iam service-accounts add-iam-policy-binding \
        "${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/iam.workloadIdentityUser" \
        --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-actions-pool/attribute.repository/organicfreshcoffee/landing"
    
    print_info "Workload Identity Federation configured!"
}

print_summary() {
    print_step "Setup completed! Here's what you need to configure in GitHub:"
    echo ""
    echo -e "${YELLOW}GitHub Secrets to add:${NC}"
    echo "=============================="
    echo "GCP_PROJECT_ID: $PROJECT_ID"
    echo "SERVICE_ACCOUNT_EMAIL: ${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
    
    # Get the full workload identity provider name
    PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
    WORKLOAD_IDENTITY_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-actions-pool/providers/github-actions-provider"
    echo "WORKLOAD_IDENTITY_PROVIDER: $WORKLOAD_IDENTITY_PROVIDER"
    echo ""
    echo -e "${YELLOW}Additional secrets you need to add:${NC}"
    echo "=================================="
    echo "MONGODB_URI: (your MongoDB connection string)"
    echo "CLIENT_URL: (your client app URL - will be https://organicfreshcoffee.com)"
    echo "SERVER_URL: (your server API URL - will be set after first deployment)"
    echo ""
    echo -e "${GREEN}Your Cloud Run services will be available at:${NC}"
    echo "Client: https://${CLIENT_SERVICE_NAME}-${PROJECT_NUMBER}.${REGION}.run.app"
    echo "Server: https://${SERVER_SERVICE_NAME}-${PROJECT_NUMBER}.${REGION}.run.app"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "1. Add the secrets above to your GitHub repository"
    echo "2. Set up your MongoDB database (MongoDB Atlas recommended)"
    echo "3. Push to main branch to trigger deployment"
    echo "4. After deployment, run ./scripts/setup-domain.sh to configure organicfreshcoffee.com"
    echo "5. Check the Actions tab in GitHub to monitor the deployment"
}

# Main execution
main() {
    print_header
    check_prerequisites
    get_project_id
    enable_apis
    create_artifact_registry
    create_service_account
    setup_workload_identity
    print_summary
}

# Run main function
main "$@"
