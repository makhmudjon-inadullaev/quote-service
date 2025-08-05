# Quote Service - Azure Infrastructure

This Terraform configuration deploys the Quote Service application to Azure with the following components:

## Architecture

- **App Service**: Linux-based container hosting with auto-scaling
- **Azure Container Registry**: Private Docker registry for application images
- **PostgreSQL Flexible Server**: Managed database with high availability
- **Redis Cache**: In-memory caching for improved performance
- **Application Insights**: Application monitoring and telemetry
- **Log Analytics**: Centralized logging and monitoring
- **Virtual Network**: Secure network isolation with subnets

## Prerequisites

1. **Azure CLI**: Install and login to Azure
   ```bash
   az login
   ```

2. **Terraform**: Install Terraform (version >= 1.0)

3. **Docker**: For building and pushing container images

## Deployment Steps

### 1. Initialize Terraform

```bash
cd terraform
terraform init
```

### 2. Configure Variables

Copy the example variables file and update with your values:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your specific configuration:
- Update `db_admin_password` with a secure password
- Modify resource names and locations as needed
- Adjust SKUs based on your requirements

### 3. Plan and Apply

```bash
# Review the planned changes
terraform plan

# Apply the configuration
terraform apply
```

### 4. Build and Deploy Application

After the infrastructure is created, build and push your Docker image:

```bash
# Get ACR login server from Terraform output
ACR_LOGIN_SERVER=$(terraform output -raw container_registry_login_server)

# Login to Azure Container Registry
az acr login --name $(terraform output -raw container_registry_login_server | cut -d'.' -f1)

# Build and tag the Docker image
docker build -t $ACR_LOGIN_SERVER/quote-service:latest .

# Push the image
docker push $ACR_LOGIN_SERVER/quote-service:latest
```

### 5. Run Database Migrations

```bash
# Get the database connection string
DATABASE_URL=$(terraform output -raw database_connection_string)

# Run Prisma migrations
npx prisma migrate deploy
```

## Configuration

### Environment Variables

The following environment variables are automatically configured in the App Service:

- `NODE_ENV`: Set to "production"
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `APPINSIGHTS_INSTRUMENTATIONKEY`: Application Insights key

### Scaling

The App Service is configured with auto-scaling rules:
- Scale out when CPU > 70% for 5 minutes
- Scale in when CPU < 30% for 5 minutes
- Min instances: 1, Max instances: 3

### Monitoring

- **Application Insights**: Tracks application performance and errors
- **Availability Tests**: Monitors endpoint health from multiple locations
- **Metric Alerts**: Notifications for high CPU, memory, and slow response times

## Security Features

- **Virtual Network Integration**: App Service runs in a private subnet
- **Private Database**: PostgreSQL server accessible only from the VNet
- **Managed Identity**: App Service uses managed identity for ACR access
- **SSL/TLS**: All connections use encrypted protocols
- **Firewall Rules**: Database and Redis have restricted access

## Cost Optimization

For development/testing environments:
- Use Basic tier for App Service (`B1`)
- Use Basic tier for PostgreSQL (`B_Standard_B1ms`)
- Use Basic tier for Redis (`Basic C0`)

For production environments:
- Upgrade to Premium tiers for better performance and SLA
- Enable geo-redundant backups
- Consider reserved instances for cost savings

## Cleanup

To destroy all resources:

```bash
terraform destroy
```

## Troubleshooting

### Common Issues

1. **Container Registry Access**: Ensure the App Service managed identity has `AcrPull` role
2. **Database Connection**: Check if the database subnet delegation is properly configured
3. **App Service Startup**: Review App Service logs in the Azure portal

### Useful Commands

```bash
# View Terraform outputs
terraform output

# Check App Service logs
az webapp log tail --name $(terraform output -raw app_service_name) --resource-group $(terraform output -raw resource_group_name)

# Connect to PostgreSQL
az postgres flexible-server connect --name $(terraform output -raw database_name) --admin-user $(terraform output -raw db_admin_username)
```