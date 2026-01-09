from mcp.server.fastmcp import FastMCP
import psycopg2
from psycopg2.extras import RealDictCursor
import os
from dotenv import load_dotenv, find_dotenv
from typing import List, Any, Dict

# Load environment variables
# Load environment variables
load_dotenv(find_dotenv(".env.local"))
load_dotenv()

# Initialize FastMCP server
mcp = FastMCP("postgres-server")

# Configuration
DB_HOST = os.getenv('POSTGRES_HOST', 'localhost')
DB_NAME = os.getenv('POSTGRES_DB', 'econexo_db')
DB_USER = os.getenv('POSTGRES_USER', 'postgres')
DB_PASSWORD = os.getenv('POSTGRES_PASSWORD', 'password')
DB_PORT = os.getenv('POSTGRES_PORT', '5432')

def get_connection():
    """Establishes a connection to the PostgreSQL database."""
    conn = psycopg2.connect(
        host=DB_HOST,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        port=DB_PORT
    )
    return conn

@mcp.tool()
def query_customers(query_sql: str) -> List[Dict[str, Any]]:
    """
    Execute a read-only SQL query against the customer database.
    Only SELECT statements are allowed for safety.
    """
    if not query_sql.strip().lower().startswith("select"):
        raise ValueError("Only SELECT queries are allowed.")
    
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query_sql)
            results = cur.fetchall()
            return [dict(row) for row in results]
    finally:
        conn.close()

@mcp.tool()
def get_customer_by_id(customer_id: int) -> Dict[str, Any]:
    """Retrieve customer details by their ID."""
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM customers WHERE id = %s", (customer_id,))
            result = cur.fetchone()
            return dict(result) if result else {}
    finally:
        conn.close()

@mcp.tool()
def list_tables() -> List[str]:
    """List all tables in the public schema."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            """)
            return [row[0] for row in cur.fetchall()]
    finally:
        conn.close()

if __name__ == "__main__":
    mcp.run()
