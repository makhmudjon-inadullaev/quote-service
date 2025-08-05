#!/bin/bash

# Azure Deployment Script for Quote Service
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required tools are installed
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command -v az &> /dev/null; then
        print_error "Azure CLI is not installed. Please install it first."
        exit 1
    fi
    
    if ! command -v terraform &> /dev/null; then
        print_error "Terraform is not installed. Please install it first."
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install it first."
        exit 1
    fi
    
    print_status "All prerequisites are installed."
}

# Login to Azure
azure_login() {
    print_status "Checking Azure login status..."
    
    if ! az account show &> /dev/null; then
        print_warning "Not logged in to Azure. Please login."
        az login
    else
        print_status "Already logged in to Azure."
        az account show --query "name" -o tsv
    fi
}

# Initialize and apply Terraform
deploy_infrastructure() {
    print_status "Deploying infrastructure with Terraform..."
    
    cd terraform
    
    # Initialize Terraform
    terraform init
    
    # Validate configuration
    terraform validate
    
    # Plan deployment
    print_status "Planning Terraform deployment..."
    terraform plan -out=tfplan
    
    # Apply deployment
    print_status "Applying Terraform configuration..."
    terraform apply tfplan
    
    # Clean up plan file
    rm tfplan
    
    cd ..
}

# Build and push Docker image
build_and_push_image() {
    print_status "Building and pushing Docker image..."
    
    # Get ACR details from Terraform output
    cd terraform
    ACR_LOGIN_SERVER=$(terraform output -raw container_registry_login_server)
    ACR_NAME=$(echo $ACR_LOGIN_SERVER | cut -d'.' -f1)
    cd ..
    
    print_status "Container Registry: $ACR_LOGIN_SERVER"
    
    # Login to ACR
    az acr login --name $ACR_NAME
    
    # Build Docker image
    print_status "Building Docker image..."
    docker build -t $ACR_LOGIN_SERVER/quote-service:latest .
    
    # Push Docker image
    print_status "Pushing Docker image to ACR..."
    docker push $ACR_LOGIN_SERVER/quote-service:latest
    
    print_status "Docker image pushed successfully."
}

# Run database migrations
run_migrations() {
    print_status "Running database migrations..."
    
    cd terraform
    DATABASE_URL="postgresql://$(terraform output -raw db_admin_username):$(terraform output -raw db_admin_password)@$(terraform output -raw database_fqdn):5432/quotes?sslmode=require"
    cd ..
    
    # Set environment variable and run migrations
    export DATABASE_URL=$DATABASE_URL
    
    # Generate Prisma client
    npx prisma generate
    
    # Run migrations
    npx prisma migrate deploy
    
    print_status "Database migrations completed."
}

# Restart App Service to pull new image
restart_app_service() {
    print_status "Restarting App Service..."
    
    cd terraform
    APP_SERVICE_NAME=$(terraform output -raw app_service_name)
    RESOURCE_GROUP_NAME=$(terraform output -raw resource_group_name)
    cd ..
    
    az webapp restart --name $APP_SERVICE_NAME --resource-group $RESOURCE_GROUP_NAME
    
    print_status "App Service restarted."
}

# Display deployment information
show_deployment_info() {
    print_status "Deployment completed successfully!"
    
    cd terraform
    echo ""
    echo "=== Deployment Information ==="
    echo "App Service URL: $(terraform output -raw app_service_url)"
    echo "Resource Group: $(terraform output -raw resource_group_name)"
    echo "Container Registry: $(terraform output -raw container_registry_login_server)"
    echo ""
    echo "=== Useful Commands ==="
    echo "View logs: az webapp log tail --name $(terraform output -raw app_service_name) --resource-group $(terraform output -raw resource_group_name)"
    echo "SSH to container: az webapp ssh --name $(terraform output -raw app_service_name) --resource-group $(terraform output -raw resource_group_name)"
    echo ""
    cd ..
}

# Main deployment function
main() {
    print_status "Starting Azure deployment for Quote Service..."
    
    check_prerequisites
    azure_login
    deploy_infrastructure
    build_and_push_image
    run_migrations
    restart_app_service
    show_deployment_info
    
    print_status "Deployment completed successfully!"
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "infrastructure")
        check_prerequisites
        azure_login
        deploy_infrastructure
        ;;
    "image")
        check_prerequisites
        azure_login
        build_and_push_image
        restart_app_service
        ;;
    "migrate")
        check_prerequisites
        run_migrations
        ;;
    "destroy")
        print_warning "This will destroy all Azure resources. Are you sure? (y/N)"
        read -r response
        if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
            cd terraform
            terraform destroy
            cd ..
            print_status "Resources destroyed."
        else
            print_status "Destruction cancelled."
        fi
        ;;
    *)
        echo "Usage: $0 {deploy|infrastructure|image|migrate|destroy}"
        echo ""
        echo "Commands:"
        echo "  deploy        - Full deployment (default)"
        echo "  infrastructure - Deploy only infrastructure"
        echo "  image         - Build and push Docker image only"
        echo "  migrate       - Run database migrations only"
        echo "  destroy       - Destroy all resources"
        exit 1
        ;;
esac