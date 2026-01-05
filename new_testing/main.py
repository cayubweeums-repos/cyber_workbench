#!/usr/bin/env python3
"""
CrowdStrike Event Search Tool

Searches for events across multiple CrowdStrike instances using FQL queries.
Results are saved to JSON files named {instance_name}_events.json
"""

import json
import sys
import yaml
from falconpy import EventStreams


def load_config(config_path="config.yml"):
    """Load configuration from YAML file."""
    try:
        with open(config_path, "r") as f:
            return yaml.safe_load(f)
    except FileNotFoundError:
        print(f"Error: Configuration file '{config_path}' not found.")
        sys.exit(1)
    except yaml.YAMLError as e:
        print(f"Error: Invalid YAML in '{config_path}': {e}")
        sys.exit(1)


def search_events(instance_config, fql_query):
    """
    Search for events in a single CrowdStrike instance using Direct Authentication.
    Returns list of all events matching the query.
    
    Uses Direct Authentication (FalconPy v0.6.2+) which is the standard method.
    Supports MSSP authentication via member_cid when provided.
    """
    instance_name = instance_config["instance_name"]
    print(f"Searching instance: {instance_name}")
    
    try:
        # Direct Authentication: Pass credentials directly to EventStreams service class
        # No need to call authenticate() - token is obtained automatically on first request
        # For MSSP scenarios, include member_cid to authenticate to child tenant
        auth_params = {
            "client_id": instance_config["client_id"],
            "client_secret": instance_config["client_secret"],
            "base_url": instance_config["base_url"]
        }
        
        # Add member_cid for MSSP authentication if provided
        if "member_cid" in instance_config and instance_config["member_cid"]:
            auth_params["member_cid"] = instance_config["member_cid"]
            print(f"  Using MSSP authentication for CID: {instance_config['member_cid']}")
        
        event_streams = EventStreams(**auth_params)
        
        all_events = []
        offset = 0
        limit = 500
        
        while True:
            # Query events using FalconPy EventStreams service class
            # The query_events method searches for events matching the FQL filter
            response = event_streams.query_events(
                filter=fql_query,
                limit=limit,
                offset=offset
            )
            
            status_code = response.get("status_code", 0)
            if status_code == 401:
                print(f"  Error: Authentication failed for {instance_name}")
                return None
            if status_code != 200:
                body = response.get("body", {})
                error_msg = body.get("errors", [{}])[0].get("message", "Unknown error") if isinstance(body, dict) else "Unknown error"
                print(f"  Error: API request failed for {instance_name} (status {status_code}): {error_msg}")
                return None
            
            body = response.get("body", {})
            events = body.get("resources", []) if isinstance(body, dict) else []
            if not events:
                break
            
            all_events.extend(events)
            print(f"  Retrieved {len(events)} events (total: {len(all_events)})")
            
            if len(events) < limit:
                break
            offset += limit
        
        print(f"  Total events found: {len(all_events)}")
        return all_events
    except Exception as e:
        print(f"  Error searching {instance_name}: {e}")
        return None


def save_results(instance_name, events):
    """Save events to JSON file."""
    filename = f"{instance_name}_events.json"
    try:
        with open(filename, "w") as f:
            json.dump(events, f, indent=2)
        print(f"  Results saved to {filename}")
    except Exception as e:
        print(f"  Error saving results for {instance_name}: {e}")


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: python main.py \"<FQL_query_string>\"")
        print("Example: python main.py \"event_type:'ProcessRollup2' AND event_platform:'Windows'\"")
        sys.exit(1)
    
    fql_query = sys.argv[1]
    print(f"Searching for events with query: {fql_query}\n")
    
    config = load_config()
    if not config:
        print("Error: Configuration file is empty.")
        sys.exit(1)
    
    for instance_config in config:
        required_fields = ["instance_name", "client_id", "client_secret", "base_url"]
        if not all(field in instance_config for field in required_fields):
            print(f"Error: Instance config missing required fields: {required_fields}")
            continue
        
        # member_cid is optional - only needed for MSSP child tenant authentication
        if "member_cid" in instance_config and instance_config["member_cid"]:
            print(f"  MSSP mode: Authenticating to child CID: {instance_config['member_cid']}")
        
        events = search_events(instance_config, fql_query)
        if events is not None:
            save_results(instance_config["instance_name"], events)
        print()


if __name__ == "__main__":
    main()
