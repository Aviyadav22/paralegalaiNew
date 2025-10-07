# Azure Blob Storage Setup Guide

This guide explains how to configure the application to use Azure Blob Storage for storing and retrieving original PDF and document files instead of local filesystem storage.

## Overview

The application now supports two storage modes:
- **Local Storage** (default): Files are stored on the local filesystem
- **Azure Blob Storage**: Files are stored in Azure Blob Storage containers

## Benefits of Azure Blob Storage

- **Scalability**: No local disk space limitations
- **Reliability**: Built-in redundancy and high availability
- **Accessibility**: Files can be accessed from any server instance
- **Cost-effective**: Pay only for what you use
- **Security**: Enterprise-grade security and encryption

## Prerequisites

1. An Azure account with an active subscription
2. An Azure Storage Account created in your Azure portal
3. Access to the storage account connection string or account keys

## Creating an Azure Storage Account

If you don't have an Azure Storage Account yet:

1. Go to [Azure Portal](https://portal.azure.com)
2. Click "Create a resource" → "Storage" → "Storage account"
3. Fill in the required details:
   - **Subscription**: Select your subscription
   - **Resource group**: Create new or use existing
   - **Storage account name**: Choose a unique name (e.g., `paralegalaistorage`)
   - **Region**: Choose a region close to your application
   - **Performance**: Standard (recommended for most use cases)
   - **Redundancy**: LRS (Locally-redundant storage) or higher based on your needs
4. Click "Review + create" → "Create"
5. Wait for deployment to complete

## Getting Your Connection String

### Method 1: Connection String (Recommended)

1. Navigate to your Storage Account in Azure Portal
2. Go to "Security + networking" → "Access keys"
3. Copy the **Connection string** from key1 or key2

### Method 2: Account Name and Key

1. Navigate to your Storage Account in Azure Portal
2. Go to "Security + networking" → "Access keys"
3. Copy:
   - **Storage account name** (shown at the top)
   - **Key** from key1 or key2

## Environment Configuration

Add the following environment variables to your `.env` file:

### Option 1: Using Connection String (Recommended)

```env
# Storage Mode - Set to 'azure' to enable Azure Blob Storage
STORAGE_MODE=azure

# Azure Blob Storage Configuration
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=your-account-name;AccountKey=your-account-key;EndpointSuffix=core.windows.net

# Optional: Custom container names (defaults shown)
AZURE_STORAGE_CONTAINER_NAME=original-files
AZURE_STORAGE_METADATA_CONTAINER_NAME=original-files-metadata
```

### Option 2: Using Account Name and Key

```env
# Storage Mode - Set to 'azure' to enable Azure Blob Storage
STORAGE_MODE=azure

# Azure Blob Storage Configuration
AZURE_STORAGE_ACCOUNT_NAME=your-account-name
AZURE_STORAGE_ACCOUNT_KEY=your-account-key

# Optional: Custom container names (defaults shown)
AZURE_STORAGE_CONTAINER_NAME=original-files
AZURE_STORAGE_METADATA_CONTAINER_NAME=original-files-metadata
```

### For Local Storage (Default)

If you want to use local filesystem storage (default behavior):

```env
# Storage Mode - Set to 'local' or omit this variable
STORAGE_MODE=local
```

## Configuration Variables Explained

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STORAGE_MODE` | No | `local` | Set to `azure` to enable Azure Blob Storage, or `local` for filesystem storage |
| `AZURE_STORAGE_CONNECTION_STRING` | Yes* | - | Full connection string from Azure Portal (Method 1) |
| `AZURE_STORAGE_ACCOUNT_NAME` | Yes** | - | Storage account name (Method 2) |
| `AZURE_STORAGE_ACCOUNT_KEY` | Yes** | - | Storage account access key (Method 2) |
| `AZURE_STORAGE_CONTAINER_NAME` | No | `original-files` | Container name for storing original files |
| `AZURE_STORAGE_METADATA_CONTAINER_NAME` | No | `original-files-metadata` | Container name for storing file metadata |

\* Required if using Method 1 (Connection String)  
\** Required if using Method 2 (Account Name and Key)

## Installation

Install the required Azure Blob Storage SDK:

```bash
# In the server directory
cd server
npm install @azure/storage-blob
```

## Container Structure

The application will automatically create two containers in your Azure Storage Account:

### 1. `original-files` (or your custom name)
Stores the actual file content with a sharded directory structure:
```
original-files/
├── 00/
│   ├── 00abc123-def4-5678-90ab-cdef12345678.pdf
│   └── 00xyz789-abc1-2345-6789-abcdef123456.docx
├── 01/
│   └── 01abc123-def4-5678-90ab-cdef12345678.txt
├── 02/
...
└── ff/
```

### 2. `original-files-metadata` (or your custom name)
Stores JSON metadata for each file:
```
original-files-metadata/
├── 00abc123-def4-5678-90ab-cdef12345678.meta.json
├── 00xyz789-abc1-2345-6789-abcdef123456.meta.json
├── 01abc123-def4-5678-90ab-cdef12345678.meta.json
...
```

## How It Works

### File Upload Flow

1. User uploads a PDF/document through the application
2. Collector processes the file and extracts text content
3. **Original file is uploaded to Azure Blob Storage** with sharded path (e.g., `00/00abc123...pdf`)
4. **Metadata is stored as JSON blob** in metadata container
5. File ID and metadata are embedded in the vector database
6. Temporary local file is deleted

### File Retrieval Flow

1. User clicks "View PDF" button in citation modal
2. Frontend requests file via `/api/original-files/{fileId}`
3. Server retrieves metadata from Azure Blob Storage
4. **Server streams file directly from Azure** to the user's browser
5. Browser displays the PDF inline or downloads it

## Supported File Types

The following file types are automatically stored in Azure Blob Storage:

- **PDF** (`.pdf`)
- **Text** (`.txt`)
- **Word Documents** (`.docx`)
- **Excel Spreadsheets** (`.xlsx`)

Additional file types can be added by updating the respective converter files in `collector/processSingleFile/convert/`.

## Security Best Practices

1. **Never commit credentials**: Keep your `.env` file in `.gitignore`
2. **Use connection strings**: Prefer connection strings over separate account name/key
3. **Rotate keys regularly**: Periodically regenerate your access keys in Azure Portal
4. **Use private containers**: Containers are created as private by default
5. **Enable HTTPS only**: The application uses HTTPS endpoints by default
6. **Consider Azure Key Vault**: For production, store secrets in Azure Key Vault

## Monitoring and Costs

### Monitoring Storage Usage

1. Go to Azure Portal → Your Storage Account
2. View "Metrics" to see:
   - Total blob capacity
   - Transaction count
   - Egress (data transfer out)

### Cost Estimation

Azure Blob Storage pricing depends on:
- **Storage capacity**: ~$0.018/GB per month (LRS, hot tier)
- **Operations**: Read/write operations (minimal cost)
- **Data transfer**: Egress charges for data leaving Azure

Example: Storing 100GB of documents with moderate access:
- Storage: ~$1.80/month
- Operations: ~$0.50/month
- **Total: ~$2.30/month**

For detailed pricing, visit: [Azure Blob Storage Pricing](https://azure.microsoft.com/en-us/pricing/details/storage/blobs/)

## Troubleshooting

### Error: "Azure Storage credentials not found"

**Solution**: Ensure you've set either `AZURE_STORAGE_CONNECTION_STRING` or both `AZURE_STORAGE_ACCOUNT_NAME` and `AZURE_STORAGE_ACCOUNT_KEY` in your `.env` file.

### Error: "Failed to initialize Azure Blob Storage"

**Possible causes**:
1. Invalid connection string or credentials
2. Network connectivity issues
3. Storage account doesn't exist or is inaccessible

**Solution**: 
- Verify your connection string in Azure Portal
- Check network/firewall settings
- Ensure storage account is active

### Error: "Container not found"

**Solution**: The application automatically creates containers. If this error persists:
1. Check if your storage account has permissions to create containers
2. Manually create containers named `original-files` and `original-files-metadata` in Azure Portal

### Files not appearing in Azure Portal

**Solution**: 
1. Check that `STORAGE_MODE=azure` is set in `.env`
2. Restart the server after changing environment variables
3. Upload a new file to test
4. Check Azure Portal → Storage Account → Containers

### Slow file retrieval

**Possible causes**:
1. Storage account in different region than application
2. Network latency
3. Large file sizes

**Solution**:
- Choose a storage account region close to your application
- Enable Azure CDN for frequently accessed files
- Consider using Azure Premium Storage for better performance

## Migration from Local to Azure Storage

If you have existing files in local storage and want to migrate to Azure:

### Manual Migration Script

Create a migration script (not included, but here's the approach):

1. Read all files from local `storage/original-files/` directory
2. For each file:
   - Read the file content
   - Read the corresponding `.meta.json` file
   - Upload file to Azure using `azureBlobStorage.uploadFile()`
   - Upload metadata using `azureBlobStorage.storeMetadata()`
3. Verify all files are uploaded successfully
4. Update `.env` to set `STORAGE_MODE=azure`
5. Restart the application

### Hybrid Mode (Not Currently Supported)

The application currently doesn't support hybrid mode where some files are local and others are in Azure. The `storageMode` field in metadata tracks where each file is stored, but retrieval is based on the current `STORAGE_MODE` setting.

## Rollback to Local Storage

To switch back to local storage:

1. Set `STORAGE_MODE=local` in `.env`
2. Restart the application
3. Files uploaded while in Azure mode will remain in Azure but won't be accessible
4. New uploads will be stored locally

**Note**: Existing files in Azure won't be automatically downloaded. You'll need to manually migrate them back if needed.

## Testing Your Configuration

After setting up Azure Blob Storage:

1. Set `STORAGE_MODE=azure` in `.env`
2. Restart the server
3. Upload a test PDF document
4. Check Azure Portal → Storage Account → Containers → `original-files`
5. Verify the file appears in the sharded directory structure
6. In the application, click "View PDF" on a citation
7. Verify the PDF loads correctly

## Support

For issues related to:
- **Azure Blob Storage**: [Azure Support](https://azure.microsoft.com/en-us/support/)
- **Application Issues**: Check application logs and GitHub issues

## Additional Resources

- [Azure Blob Storage Documentation](https://docs.microsoft.com/en-us/azure/storage/blobs/)
- [Azure Storage SDK for JavaScript](https://github.com/Azure/azure-sdk-for-js/tree/main/sdk/storage/storage-blob)
- [Azure Storage Explorer](https://azure.microsoft.com/en-us/features/storage-explorer/) - Desktop app to manage Azure Storage
