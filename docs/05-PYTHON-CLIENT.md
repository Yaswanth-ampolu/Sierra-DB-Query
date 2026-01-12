# Sierra DB Query - Python Client Guide

This guide shows how to interact with Sierra DB Query MCP server using Python.

---

## Table of Contents

1. [Installation](#installation)
2. [Basic Client](#basic-client)
3. [Async Client](#async-client)
4. [Full Featured Client Class](#full-featured-client-class)
5. [ORM-Style Wrapper](#orm-style-wrapper)
6. [Examples](#examples)
7. [Error Handling](#error-handling)

---

## Installation

```bash
# Required packages
pip install requests aiohttp sseclient-py
```

---

## Basic Client

### Simple Synchronous Client

```python
#!/usr/bin/env python3
"""
sierra_client.py - Basic Sierra MCP Client
"""

import json
import requests
from typing import Any, Optional

class SierraMCPClient:
    """Simple synchronous client for Sierra DB Query MCP server."""

    def __init__(self, base_url: str = "http://localhost:7409", connection_string: Optional[str] = None):
        self.base_url = base_url
        self.mcp_url = f"{base_url}/mcp"
        self.connection_string = connection_string
        self.session_id: Optional[str] = None
        self.request_id = 0

    def _next_id(self) -> int:
        self.request_id += 1
        return self.request_id

    def _parse_sse_response(self, response: requests.Response) -> dict:
        """Parse Server-Sent Events response."""
        for line in response.text.split('\n'):
            if line.startswith('data: '):
                return json.loads(line[6:])
        raise ValueError("No data in SSE response")

    def initialize(self) -> dict:
        """Initialize MCP session."""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream"
        }

        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "python-client",
                    "version": "1.0.0"
                }
            }
        }

        response = requests.post(self.mcp_url, headers=headers, json=payload)
        self.session_id = response.headers.get("mcp-session-id")

        return self._parse_sse_response(response)

    def call_tool(self, tool_name: str, arguments: dict) -> dict:
        """Call an MCP tool."""
        if not self.session_id:
            self.initialize()

        # Add connection string if provided
        if self.connection_string and "connectionString" not in arguments:
            arguments["connectionString"] = self.connection_string

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "mcp-session-id": self.session_id
        }

        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        }

        response = requests.post(self.mcp_url, headers=headers, json=payload)
        return self._parse_sse_response(response)

    def health_check(self) -> dict:
        """Check server health."""
        response = requests.get(f"{self.base_url}/health")
        return response.json()

    # Convenience methods
    def query(self, sql: str, params: list = None, limit: int = None) -> dict:
        """Execute SELECT query."""
        args = {
            "operation": "select",
            "query": sql
        }
        if params:
            args["parameters"] = params
        if limit:
            args["limit"] = limit

        return self.call_tool("sierra_execute_query", args)

    def execute(self, sql: str, params: list = None) -> dict:
        """Execute arbitrary SQL."""
        args = {
            "sql": sql,
            "expectRows": False
        }
        if params:
            args["parameters"] = params

        return self.call_tool("sierra_execute_sql", args)

    def insert(self, table: str, data: dict, returning: str = "*") -> dict:
        """Insert data into table."""
        return self.call_tool("sierra_execute_mutation", {
            "operation": "insert",
            "table": table,
            "data": data,
            "returning": returning
        })

    def update(self, table: str, data: dict, where: str) -> dict:
        """Update data in table."""
        return self.call_tool("sierra_execute_mutation", {
            "operation": "update",
            "table": table,
            "data": data,
            "where": where
        })

    def delete(self, table: str, where: str) -> dict:
        """Delete data from table."""
        return self.call_tool("sierra_execute_mutation", {
            "operation": "delete",
            "table": table,
            "where": where
        })

    def get_tables(self) -> dict:
        """Get list of tables."""
        return self.call_tool("sierra_manage_schema", {
            "operation": "get_info"
        })

    def get_table_info(self, table_name: str) -> dict:
        """Get detailed table information."""
        return self.call_tool("sierra_manage_schema", {
            "operation": "get_info",
            "tableName": table_name
        })


# Usage example
if __name__ == "__main__":
    # Create client
    client = SierraMCPClient(
        base_url="http://localhost:7409",
        connection_string="postgresql://user:pass@localhost:5432/db"
    )

    # Check health
    print("Health:", client.health_check())

    # Get tables
    result = client.get_tables()
    print("Tables:", result)

    # Run query
    result = client.query("SELECT * FROM users LIMIT 5")
    print("Users:", result)
```

---

## Async Client

```python
#!/usr/bin/env python3
"""
sierra_async_client.py - Async Sierra MCP Client
"""

import json
import aiohttp
from typing import Any, Optional

class AsyncSierraMCPClient:
    """Asynchronous client for Sierra DB Query MCP server."""

    def __init__(self, base_url: str = "http://localhost:7409", connection_string: Optional[str] = None):
        self.base_url = base_url
        self.mcp_url = f"{base_url}/mcp"
        self.connection_string = connection_string
        self.session_id: Optional[str] = None
        self.request_id = 0
        self._session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self):
        self._session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._session:
            await self._session.close()

    def _next_id(self) -> int:
        self.request_id += 1
        return self.request_id

    async def _parse_sse_response(self, response: aiohttp.ClientResponse) -> dict:
        """Parse Server-Sent Events response."""
        text = await response.text()
        for line in text.split('\n'):
            if line.startswith('data: '):
                return json.loads(line[6:])
        raise ValueError("No data in SSE response")

    async def initialize(self) -> dict:
        """Initialize MCP session."""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream"
        }

        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "python-async-client",
                    "version": "1.0.0"
                }
            }
        }

        async with self._session.post(self.mcp_url, headers=headers, json=payload) as response:
            self.session_id = response.headers.get("mcp-session-id")
            return await self._parse_sse_response(response)

    async def call_tool(self, tool_name: str, arguments: dict) -> dict:
        """Call an MCP tool."""
        if not self.session_id:
            await self.initialize()

        if self.connection_string and "connectionString" not in arguments:
            arguments["connectionString"] = self.connection_string

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "mcp-session-id": self.session_id
        }

        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        }

        async with self._session.post(self.mcp_url, headers=headers, json=payload) as response:
            return await self._parse_sse_response(response)

    async def query(self, sql: str, params: list = None) -> dict:
        """Execute SELECT query."""
        args = {"operation": "select", "query": sql}
        if params:
            args["parameters"] = params
        return await self.call_tool("sierra_execute_query", args)

    async def get_tables(self) -> dict:
        """Get list of tables."""
        return await self.call_tool("sierra_manage_schema", {"operation": "get_info"})


# Usage example
async def main():
    async with AsyncSierraMCPClient(
        connection_string="postgresql://user:pass@localhost:5432/db"
    ) as client:
        # Get tables
        tables = await client.get_tables()
        print("Tables:", tables)

        # Run multiple queries concurrently
        import asyncio
        results = await asyncio.gather(
            client.query("SELECT COUNT(*) FROM users"),
            client.query("SELECT COUNT(*) FROM orders"),
            client.query("SELECT COUNT(*) FROM products")
        )
        print("Counts:", results)


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
```

---

## Full Featured Client Class

```python
#!/usr/bin/env python3
"""
sierra_full_client.py - Full-featured Sierra MCP Client with all tools
"""

import json
import requests
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Union
from enum import Enum


class AnalysisType(Enum):
    CONFIGURATION = "configuration"
    PERFORMANCE = "performance"
    SECURITY = "security"


class IndexMethod(Enum):
    BTREE = "btree"
    HASH = "hash"
    GIST = "gist"
    SPGIST = "spgist"
    GIN = "gin"
    BRIN = "brin"


@dataclass
class QueryResult:
    success: bool
    data: Any
    error: Optional[str] = None
    row_count: int = 0


class SierraDB:
    """Full-featured Sierra DB Query client."""

    def __init__(
        self,
        base_url: str = "http://localhost:7409",
        connection_string: Optional[str] = None,
        auto_init: bool = True
    ):
        self.base_url = base_url
        self.mcp_url = f"{base_url}/mcp"
        self.connection_string = connection_string
        self.session_id: Optional[str] = None
        self.request_id = 0

        if auto_init:
            self.initialize()

    def _next_id(self) -> int:
        self.request_id += 1
        return self.request_id

    def _parse_sse_response(self, response: requests.Response) -> dict:
        for line in response.text.split('\n'):
            if line.startswith('data: '):
                return json.loads(line[6:])
        raise ValueError("No data in SSE response")

    def _call(self, method: str, params: dict) -> dict:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream"
        }
        if self.session_id:
            headers["mcp-session-id"] = self.session_id

        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": method,
            "params": params
        }

        response = requests.post(self.mcp_url, headers=headers, json=payload)
        response.raise_for_status()

        if "mcp-session-id" in response.headers:
            self.session_id = response.headers["mcp-session-id"]

        return self._parse_sse_response(response)

    def _tool(self, name: str, args: dict) -> QueryResult:
        if self.connection_string and "connectionString" not in args:
            args["connectionString"] = self.connection_string

        try:
            result = self._call("tools/call", {"name": name, "arguments": args})
            content = result.get("result", {}).get("content", [])
            is_error = result.get("result", {}).get("isError", False)

            if content:
                text = content[0].get("text", "")
                if is_error:
                    return QueryResult(success=False, data=None, error=text)

                # Try to parse JSON from text
                try:
                    # Extract JSON if present
                    if "Results:" in text:
                        json_start = text.find('[')
                        if json_start != -1:
                            data = json.loads(text[json_start:])
                            return QueryResult(success=True, data=data, row_count=len(data))
                except:
                    pass

                return QueryResult(success=True, data=text)

            return QueryResult(success=True, data=result)

        except Exception as e:
            return QueryResult(success=False, data=None, error=str(e))

    # ==================== Core Methods ====================

    def initialize(self) -> dict:
        """Initialize MCP session."""
        return self._call("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "sierra-python", "version": "1.0.0"}
        })

    def health(self) -> dict:
        """Check server health."""
        return requests.get(f"{self.base_url}/health").json()

    # ==================== Schema Management ====================

    def tables(self) -> List[str]:
        """Get list of table names."""
        result = self._tool("sierra_manage_schema", {"operation": "get_info"})
        if result.success and isinstance(result.data, str):
            # Parse table names from text
            import re
            match = re.search(r'\[(.*?)\]', result.data.replace('\n', ''))
            if match:
                return json.loads(f"[{match.group(1)}]")
        return []

    def table_info(self, table_name: str) -> QueryResult:
        """Get detailed table information."""
        return self._tool("sierra_manage_schema", {
            "operation": "get_info",
            "tableName": table_name
        })

    def create_table(self, table_name: str, columns: List[Dict]) -> QueryResult:
        """Create a new table."""
        return self._tool("sierra_manage_schema", {
            "operation": "create_table",
            "tableName": table_name,
            "columns": columns
        })

    def alter_table(self, table_name: str, operations: List[Dict]) -> QueryResult:
        """Alter an existing table."""
        return self._tool("sierra_manage_schema", {
            "operation": "alter_table",
            "tableName": table_name,
            "operations": operations
        })

    # ==================== Query Operations ====================

    def query(self, sql: str, params: List = None, limit: int = None) -> QueryResult:
        """Execute SELECT query."""
        args = {"operation": "select", "query": sql}
        if params:
            args["parameters"] = params
        if limit:
            args["limit"] = limit
        return self._tool("sierra_execute_query", args)

    def count(self, sql: str, params: List = None) -> QueryResult:
        """Count rows matching query."""
        args = {"operation": "count", "query": sql}
        if params:
            args["parameters"] = params
        return self._tool("sierra_execute_query", args)

    def exists(self, sql: str, params: List = None) -> QueryResult:
        """Check if rows exist."""
        args = {"operation": "exists", "query": sql}
        if params:
            args["parameters"] = params
        return self._tool("sierra_execute_query", args)

    # ==================== Mutation Operations ====================

    def insert(self, table: str, data: Dict, returning: str = "*") -> QueryResult:
        """Insert data into table."""
        return self._tool("sierra_execute_mutation", {
            "operation": "insert",
            "table": table,
            "data": data,
            "returning": returning
        })

    def update(self, table: str, data: Dict, where: str) -> QueryResult:
        """Update rows in table."""
        return self._tool("sierra_execute_mutation", {
            "operation": "update",
            "table": table,
            "data": data,
            "where": where
        })

    def delete(self, table: str, where: str) -> QueryResult:
        """Delete rows from table."""
        return self._tool("sierra_execute_mutation", {
            "operation": "delete",
            "table": table,
            "where": where
        })

    def upsert(self, table: str, data: Dict, conflict_columns: List[str], returning: str = "*") -> QueryResult:
        """Insert or update on conflict."""
        return self._tool("sierra_execute_mutation", {
            "operation": "upsert",
            "table": table,
            "data": data,
            "conflictColumns": conflict_columns,
            "returning": returning
        })

    # ==================== SQL Execution ====================

    def execute(self, sql: str, params: List = None, transactional: bool = False) -> QueryResult:
        """Execute arbitrary SQL."""
        args = {"sql": sql, "expectRows": False, "transactional": transactional}
        if params:
            args["parameters"] = params
        return self._tool("sierra_execute_sql", args)

    def execute_many(self, statements: List[str]) -> List[QueryResult]:
        """Execute multiple SQL statements."""
        return [self.execute(sql) for sql in statements]

    # ==================== Analysis & Monitoring ====================

    def analyze(self, analysis_type: Union[AnalysisType, str] = AnalysisType.PERFORMANCE) -> QueryResult:
        """Analyze database."""
        if isinstance(analysis_type, AnalysisType):
            analysis_type = analysis_type.value
        return self._tool("sierra_analyze_database", {"analysisType": analysis_type})

    def monitor(
        self,
        include_queries: bool = True,
        include_locks: bool = True,
        include_tables: bool = True
    ) -> QueryResult:
        """Monitor database status."""
        return self._tool("sierra_monitor_database", {
            "includeQueries": include_queries,
            "includeLocks": include_locks,
            "includeTables": include_tables
        })

    # ==================== Index Management ====================

    def indexes(self, table_name: str = None) -> QueryResult:
        """Get indexes."""
        args = {"operation": "get"}
        if table_name:
            args["tableName"] = table_name
        return self._tool("sierra_manage_indexes", args)

    def create_index(
        self,
        index_name: str,
        table_name: str,
        columns: List[str],
        unique: bool = False,
        method: IndexMethod = IndexMethod.BTREE
    ) -> QueryResult:
        """Create an index."""
        return self._tool("sierra_manage_indexes", {
            "operation": "create",
            "indexName": index_name,
            "tableName": table_name,
            "columns": columns,
            "unique": unique,
            "method": method.value
        })

    def drop_index(self, index_name: str) -> QueryResult:
        """Drop an index."""
        return self._tool("sierra_manage_indexes", {
            "operation": "drop",
            "indexName": index_name
        })

    # ==================== Constraint Management ====================

    def constraints(self, table_name: str = None) -> QueryResult:
        """Get constraints."""
        args = {"operation": "get"}
        if table_name:
            args["tableName"] = table_name
        return self._tool("sierra_manage_constraints", args)

    def add_foreign_key(
        self,
        constraint_name: str,
        table_name: str,
        columns: List[str],
        ref_table: str,
        ref_columns: List[str],
        on_delete: str = "NO ACTION"
    ) -> QueryResult:
        """Add foreign key constraint."""
        return self._tool("sierra_manage_constraints", {
            "operation": "create_fk",
            "constraintName": constraint_name,
            "tableName": table_name,
            "columnNames": columns,
            "referencedTable": ref_table,
            "referencedColumns": ref_columns,
            "onDelete": on_delete
        })

    # ==================== Function Management ====================

    def functions(self) -> QueryResult:
        """Get functions."""
        return self._tool("sierra_manage_functions", {"operation": "get"})

    def create_function(
        self,
        name: str,
        params: str,
        return_type: str,
        body: str,
        language: str = "plpgsql"
    ) -> QueryResult:
        """Create a function."""
        return self._tool("sierra_manage_functions", {
            "operation": "create",
            "functionName": name,
            "parameters": params,
            "returnType": return_type,
            "functionBody": body,
            "language": language,
            "replace": True
        })

    # ==================== User Management ====================

    def users(self) -> QueryResult:
        """List users."""
        return self._tool("sierra_manage_users", {"operation": "list"})

    def create_user(self, username: str, password: str) -> QueryResult:
        """Create a user."""
        return self._tool("sierra_manage_users", {
            "operation": "create",
            "username": username,
            "password": password,
            "login": True
        })

    def grant(
        self,
        username: str,
        permissions: List[str],
        target_type: str,
        target: str
    ) -> QueryResult:
        """Grant permissions to user."""
        return self._tool("sierra_manage_users", {
            "operation": "grant",
            "username": username,
            "permissions": permissions,
            "targetType": target_type,
            "target": target
        })


# Usage example
if __name__ == "__main__":
    db = SierraDB(connection_string="postgresql://user:pass@localhost:5432/testdb")

    # Check health
    print("Health:", db.health())

    # Get tables
    print("Tables:", db.tables())

    # Run query
    result = db.query("SELECT * FROM users LIMIT 5")
    print("Query result:", result)

    # Insert data
    result = db.insert("users", {"name": "Alice", "email": "alice@example.com"})
    print("Insert result:", result)

    # Monitor database
    result = db.monitor()
    print("Monitor:", result)
```

---

## ORM-Style Wrapper

```python
#!/usr/bin/env python3
"""
sierra_orm.py - ORM-style wrapper for Sierra DB Query
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Type, TypeVar
from sierra_full_client import SierraDB, QueryResult

T = TypeVar('T', bound='Model')


class Model:
    """Base model class for ORM-style access."""

    __tablename__: str = ""
    __db__: Optional[SierraDB] = None

    @classmethod
    def set_db(cls, db: SierraDB):
        cls.__db__ = db

    @classmethod
    def all(cls: Type[T], limit: int = 100) -> List[Dict]:
        result = cls.__db__.query(f"SELECT * FROM {cls.__tablename__} LIMIT {limit}")
        return result.data if result.success else []

    @classmethod
    def find(cls: Type[T], id: int) -> Optional[Dict]:
        result = cls.__db__.query(
            f"SELECT * FROM {cls.__tablename__} WHERE id = $1",
            params=[id]
        )
        if result.success and result.data:
            return result.data[0] if isinstance(result.data, list) else result.data
        return None

    @classmethod
    def where(cls: Type[T], **conditions) -> List[Dict]:
        where_parts = [f"{k} = ${i+1}" for i, k in enumerate(conditions.keys())]
        where_clause = " AND ".join(where_parts)
        result = cls.__db__.query(
            f"SELECT * FROM {cls.__tablename__} WHERE {where_clause}",
            params=list(conditions.values())
        )
        return result.data if result.success else []

    @classmethod
    def create(cls: Type[T], **data) -> QueryResult:
        return cls.__db__.insert(cls.__tablename__, data)

    @classmethod
    def update_where(cls: Type[T], where: str, **data) -> QueryResult:
        return cls.__db__.update(cls.__tablename__, data, where)

    @classmethod
    def delete_where(cls: Type[T], where: str) -> QueryResult:
        return cls.__db__.delete(cls.__tablename__, where)

    @classmethod
    def count(cls: Type[T]) -> int:
        result = cls.__db__.count(f"SELECT * FROM {cls.__tablename__}")
        if result.success:
            # Parse count from result
            return int(result.data) if result.data else 0
        return 0


# Define models
class User(Model):
    __tablename__ = "users"


class Product(Model):
    __tablename__ = "products"


class Order(Model):
    __tablename__ = "orders"


# Usage
if __name__ == "__main__":
    # Initialize database
    db = SierraDB(connection_string="postgresql://user:pass@localhost:5432/testdb")

    # Set database for all models
    Model.set_db(db)

    # ORM-style operations
    users = User.all()
    print("All users:", users)

    user = User.find(1)
    print("User 1:", user)

    active_users = User.where(active=True)
    print("Active users:", active_users)

    result = User.create(name="Bob", email="bob@example.com")
    print("Created:", result)
```

---

## Examples

### Example 1: Database Migration Script

```python
#!/usr/bin/env python3
"""Run database migrations using Sierra MCP."""

from sierra_full_client import SierraDB

def run_migrations(db: SierraDB):
    migrations = [
        """
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            name VARCHAR(255),
            created_at TIMESTAMP DEFAULT NOW()
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS posts (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            title VARCHAR(255) NOT NULL,
            content TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id)
        """
    ]

    for i, sql in enumerate(migrations, 1):
        print(f"Running migration {i}...")
        result = db.execute(sql)
        if result.success:
            print(f"  Migration {i} completed")
        else:
            print(f"  Migration {i} failed: {result.error}")
            break


if __name__ == "__main__":
    db = SierraDB(connection_string="postgresql://user:pass@localhost:5432/testdb")
    run_migrations(db)
```

### Example 2: Data Export Script

```python
#!/usr/bin/env python3
"""Export table data to JSON."""

import json
from sierra_full_client import SierraDB

def export_table(db: SierraDB, table_name: str, output_file: str):
    result = db.query(f"SELECT * FROM {table_name}")

    if result.success:
        with open(output_file, 'w') as f:
            json.dump(result.data, f, indent=2, default=str)
        print(f"Exported {result.row_count} rows to {output_file}")
    else:
        print(f"Export failed: {result.error}")


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 3:
        print("Usage: python export.py <table_name> <output_file>")
        sys.exit(1)

    db = SierraDB(connection_string="postgresql://user:pass@localhost:5432/testdb")
    export_table(db, sys.argv[1], sys.argv[2])
```

### Example 3: Health Monitoring Script

```python
#!/usr/bin/env python3
"""Monitor database health and alert on issues."""

import time
from sierra_full_client import SierraDB, AnalysisType

def monitor_health(db: SierraDB, interval: int = 60):
    while True:
        print(f"\n{'='*50}")
        print(f"Health Check at {time.strftime('%Y-%m-%d %H:%M:%S')}")
        print('='*50)

        # Check server health
        health = db.health()
        print(f"Server Status: {health.get('status', 'unknown')}")

        # Monitor database
        result = db.monitor(include_queries=True, include_locks=True)
        if result.success:
            print(f"Database monitoring data: {result.data[:200]}...")

        # Analyze performance
        result = db.analyze(AnalysisType.PERFORMANCE)
        if result.success:
            print(f"Performance analysis: {result.data[:200]}...")

        print(f"\nNext check in {interval} seconds...")
        time.sleep(interval)


if __name__ == "__main__":
    db = SierraDB(connection_string="postgresql://user:pass@localhost:5432/testdb")
    monitor_health(db, interval=60)
```

---

## Error Handling

```python
from sierra_full_client import SierraDB, QueryResult

def safe_query(db: SierraDB, sql: str) -> QueryResult:
    """Execute query with comprehensive error handling."""
    try:
        result = db.query(sql)

        if not result.success:
            print(f"Query failed: {result.error}")
            # Log error, send alert, etc.

        return result

    except requests.exceptions.ConnectionError:
        print("Connection to MCP server failed")
        return QueryResult(success=False, data=None, error="Connection failed")

    except requests.exceptions.Timeout:
        print("Request timed out")
        return QueryResult(success=False, data=None, error="Timeout")

    except Exception as e:
        print(f"Unexpected error: {e}")
        return QueryResult(success=False, data=None, error=str(e))
```
