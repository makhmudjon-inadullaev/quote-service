# Azure Deployment Script for Quote Service (PowerShell)
param(
    [Parameter(Position=0)]
    [ValidateSet("deploy", "infrastructure", "image", "migrate", "destroy")]
    [string]$Action = "deploy"
)

# Function to print colored output
function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Check if required tools are installed
function Test-Prerequisites {
    Write-Status "Checking prerequisites..."
    
    if (!(Get-Command az -ErrorAction SilentlyContinue)) {
        Write-Error "Azure CLI is not installed. Please install it first."
        exit 1
    }
    
    if (!(Get-Command terraform -ErrorAction SilentlyContinue)) {
        Write-Error "Terraform is not installed. Please install it first."
        exit 1
    }
    
    if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Error "Docker is not installed. Please install it first."
        exit 1
    }
    
    Write-Status "All prerequisites are installed."
}

# Login to Azure
function Connect-Azure {
    Write-Status "Checking Azure login status..."
    
    try {
        $account = az account show --query "name" -o tsv 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Status "Already logged in to Azure: $account"
        } else {
            throw "Not logged in"
        }
    }
    catch {
        Write-Warning "Not logged in to Azure. Please login."
        az login
    }
}

# Initialize and apply Terraform
function Deploy-Infrastructure {
    Write-Status "Deploying infrastructure with Terraform..."
    
    Push-Location terraform
    
    try {
        # Initialize Terraform
        terraform init
        
        # Validate configuration
        terraform validate
        
        # Plan deployment
        Write-Status "Planning Terraform deployment..."
        terraform plan -out=tfplan
        
        # Apply deployment
        Write-Status "Applying Terraform configuration..."
        terraform apply tfplan
        
        # Clean up plan file
        Remove-Item tfplan -ErrorAction SilentlyContinue
    }
    finally {
        Pop-Location
    }
}

# Build and push Docker image
function Build-AndPushImage {
    Write-Status "Building and pushing Docker image..."
    
    # Get ACR details from Terraform output
    Push-Location terraform
    $acrLoginServer = terraform output -raw container_registry_login_server
    $acrName = $acrLoginServer.Split('.')[0]
    Pop-Location
    
    Write-Status "Container Registry: $acrLoginServer"
    
    # Login to ACR
    az acr login --name $acrName
    
    # Build Docker image
    Write-Status "Building Docker image..."
    docker build -t "$acrLoginServer/quote-service:latest" .
    
    # Push Docker image
    Write-Status "Pushing Docker image to ACR..."
    docker push "$acrLoginServer/quote-service:latest"
    
    Write-Status "Docker image pushed successfully."
}

# Run database migrations
function Invoke-Migrations {
    Write-Status "Running database migrations..."
    
    Push-Location terraform
    $dbUsername = terraform output -raw db_admin_username
    $dbPassword = terraform output -raw db_admin_password
    $dbFqdn = terraform output -raw database_fqdn
    Pop-Location
    
    $databaseUrl = "postgresql://$dbUsername`:$dbPassword@$dbFqdn`:5432/quotes?sslmode=require"
    
    # Set environment variable and run migrations
    $env:DATABASE_URL = $databaseUrl
    
    # Generate Prisma client
    npx prisma generate
    
    # Run migrations
    npx prisma migrate deploy
    
    Write-Status "Database migrations completed."
}

# Restart App Service to pull new image
function Restart-AppService {
    Write-Status "Restarting App Service..."
    
    Push-Location terraform
    $appServiceName = terraform output -raw app_service_name
    $resourceGroupName = terraform output -raw resource_group_name
    Pop-Location
    
    az webapp restart --name $appServiceName --resource-group $resourceGroupName
    
    Write-Status "App Service restarted."
}

# Display deployment information
function Show-DeploymentInfo {
    Write-Status "Deployment completed successfully!"
    
    Push-Location terraform
    $appServiceUrl = terraform output -raw app_service_url
    $resourceGroupName = terraform output -raw resource_group_name
    $containerRegistry = terraform output -raw container_registry_login_server
    $appServiceName = terraform output -raw app_service_name
    Pop-Location
    
    Write-Host ""
    Write-Host "=== Deployment Information ===" -ForegroundColor Cyan
    Write-Host "App Service URL: $appServiceUrl"
    Write-Host "Resource Group: $resourceGroupName"
    Write-Host "Container Registry: $containerRegistry"
    Write-Host ""
    Write-Host "=== Useful Commands ===" -ForegroundColor Cyan
    Write-Host "View logs: az webapp log tail --name $appServiceName --resource-group $resourceGroupName"
    Write-Host "SSH to container: az webapp ssh --name $appServiceName --resource-group $resourceGroupName"
    Write-Host ""
}

# Main deployment function
function Start-Deployment {
    Write-Status "Starting Azure deployment for Quote Service..."
    
    Test-Prerequisites
    Connect-Azure
    Deploy-Infrastructure
    Build-AndPushImage
    Invoke-Migrations
    Restart-AppService
    Show-DeploymentInfo
    
    Write-Status "Deployment completed successfully!"
}

# Handle script actions
switch ($Action) {
    "deploy" {
        Start-Deployment
    }
    "infrastructure" {
        Test-Prerequisites
        Connect-Azure
        Deploy-Infrastructure
    }
    "image" {
        Test-Prerequisites
        Connect-Azure
        Build-AndPushImage
        Restart-AppService
    }
    "migrate" {
        Test-Prerequisites
        Invoke-Migrations
    }
    "destroy" {
        $response = Read-Host "This will destroy all Azure resources. Are you sure? (y/N)"
        if ($response -match "^[yY]([eE][sS])?$") {
            Push-Location terraform
            terraform destroy
            Pop-Location
            Write-Status "Resources destroyed."
        } else {
            Write-Status "Destruction cancelled."
        }
    }
}