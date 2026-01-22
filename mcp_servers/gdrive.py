from mcp.server.fastmcp import FastMCP
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
import os
from dotenv import load_dotenv, find_dotenv
from typing import List, Optional
import google.oauth2.credentials

# Load environment variables
# Load environment variables
load_dotenv(find_dotenv(".env.local"))
load_dotenv()

# Initialize FastMCP server
mcp = FastMCP("gdrive-server")

# Configuration
SCOPES = ['https://www.googleapis.com/auth/drive.readonly']
# Expecting a service account file or similar credential mechanism
SERVICE_ACCOUNT_FILE = os.getenv('GOOGLE_APPLICATION_CREDENTIALS', 'credentials.json')

def get_drive_service():
    """Authenticates and returns the Drive service."""
    if os.path.exists(SERVICE_ACCOUNT_FILE):
        creds = Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=SCOPES)
    else:
        # Fallback to simple API key if provided, though less likely for Drive access
        # Or standard default credentials
        import google.auth
        creds, _ = google.auth.default(scopes=SCOPES)
    
    # Fallback to Access Token if provided
    if not creds or not creds.valid:
        access_token = os.getenv('GOOGLE_ACCESS_TOKEN')
        if access_token:
            creds = google.oauth2.credentials.Credentials(access_token)

        
    service = build('drive', 'v3', credentials=creds)
    return service

@mcp.tool()
def list_certificates(folder_id: Optional[str] = None) -> List[dict]:
    """
    List certificate files from a specific Google Drive folder or root.
    Returns a list of file metadata (id, name, mimeType).
    """
    service = get_drive_service()
    query = "mimeType != 'application/vnd.google-apps.folder'"
    if folder_id:
        query += f" and '{folder_id}' in parents"
    
    # Filter for things that look like certificates if needed, or just list all
    # For now, just listing
    results = service.files().list(
        q=query, pageSize=20, fields="nextPageToken, files(id, name, mimeType)"
    ).execute()
    return results.get('files', [])

@mcp.tool()
def search_certificates(name_query: str) -> List[dict]:
    """Search for certificates by name."""
    service = get_drive_service()
    query = f"name contains '{name_query}' and mimeType != 'application/vnd.google-apps.folder'"
    results = service.files().list(
        q=query, pageSize=20, fields="nextPageToken, files(id, name, mimeType)"
    ).execute()
    return results.get('files', [])

@mcp.tool()
def get_file_metadata(file_id: str) -> dict:
    """Get metadata for a specific file."""
    service = get_drive_service()
    file = service.files().get(fileId=file_id, fields="id, name, mimeType, webViewLink").execute()
    return file

if __name__ == "__main__":
    mcp.run()
