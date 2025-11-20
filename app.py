"""Main Flet application for VM Manager."""

import flet as ft
import flet_webview as ftwv
import math
import os
import sys
from pathlib import Path
from typing import Optional, Callable
from vm_manager import VMManager, VMConfig
from vm_operations import VMOperations


# Color scheme
COLOR_BG = "#262626"
COLOR_ACCENT = "#dafc7b"
COLOR_ACCENT_DARK = "#77874c"
COLOR_TEXT = "#ffffff"
COLOR_TEXT_SECONDARY = "#cccccc"


class VMManagerApp:
    """Main application class."""
    
    def __init__(self, page: ft.Page):
        try:
            self.page = page
            self.page.title = "VM Manager"
            self.repo_root = Path(__file__).parent.absolute()
            print(f"Repo root: {self.repo_root}")
            
            # Initialize managers
            print("Initializing VM Manager...")
            self.vm_manager = VMManager(str(self.repo_root))
            print("Initializing VM Operations...")
            self.vm_operations = VMOperations(str(self.repo_root))
            
            self.vm_list_view = None
            # Track VM status for real-time updates
            self.vm_status = {}  # {vm_name: "status_text"}
            self.sudo_password: Optional[str] = None
            
            # Advanced mode state
            self.advanced_mode = False
            
            # Set up routing
            self.page.on_route_change = self.route_change
            self.page.on_view_pop = self.view_pop
            
            # Set page background color
            self.page.bgcolor = COLOR_BG
            
            # Create main content column with padding
            self.content_column = ft.Column(
                expand=True, 
                scroll=ft.ScrollMode.AUTO,
                spacing=0
            )
            
            # Wrap content in container with padding to match original styling
            self.content_container = ft.Container(
                content=self.content_column,
                expand=True,
                padding=20,
                bgcolor=COLOR_BG
            )
            
            # Add main layout
            self.page.add(
                ft.Column(
                    [self.content_container],
                    expand=True
                )
            )
            
            print("Setting up routing...")
            self.page.go(self.page.route if self.page.route else "/")
            print("UI setup complete")
        except Exception as e:
            print(f"Error in VMManagerApp.__init__: {e}")
            import traceback
            traceback.print_exc()
            raise
    
    def route_change(self, e):
        """Handle route changes and build views."""
        troute = ft.TemplateRoute(self.page.route)
        
        # Ensure page background is set
        self.page.bgcolor = COLOR_BG
        
        # Clear content
        self.content_column.controls.clear()
        
        # Advanced mode toggle
        advanced_toggle = ft.Switch(
            label="Advanced Mode",
            value=self.advanced_mode,
            label_style=ft.TextStyle(color=COLOR_ACCENT),
            on_change=self.toggle_advanced_mode
        )
        
        # Set up AppBar
        self.page.appbar = ft.AppBar(
            title=ft.Text("VM Manager", color=COLOR_TEXT),
            bgcolor=COLOR_BG,
            color=COLOR_ACCENT,
            actions=[advanced_toggle]
        )
        
        # Route matching
        if troute.match("/vnc/:vm_name"):
            # VNC viewer route
            vm_name = troute.vm_name
            vnc_content = self.build_vnc_viewer_content(vm_name)
            self.content_column.controls.append(vnc_content)
        elif troute.match("/"):
            # Main VM list view - restore padding
            self.content_container.padding = 20
            
            main_content = self.build_vm_list_view()
            
            # Apply advanced mode transformations if enabled
            if self.advanced_mode:
                transformed_content = self.apply_page_transform(main_content)
                try:
                    Rotate = ft.transform.Rotate
                    rotate_obj = Rotate(angle=math.pi, alignment=ft.alignment.center)
                except AttributeError:
                    try:
                        from dataclasses import dataclass, field
                        from typing import Optional
                        @dataclass
                        class Rotate:
                            angle: float
                            alignment: Optional[ft.Alignment] = field(default=None)
                        rotate_obj = Rotate(angle=math.pi, alignment=ft.alignment.center)
                    except:
                        rotate_obj = math.pi
                
                content_container = ft.Stack(
                    controls=[
                        ft.Container(
                            content=transformed_content,
                            rotate=rotate_obj,
                            alignment=ft.alignment.center,
                            expand=True
                        )
                    ],
                    expand=True
                )
                self.content_column.controls.append(content_container)
            else:
                self.content_column.controls.append(main_content)
        else:
            # 404 - Page not found
            self.content_column.controls.append(
                ft.Container(
                    content=ft.Column(
                        [
                            ft.Text(f"404 - Page not found: {self.page.route}", 
                                   size=20, color=COLOR_TEXT),
                            ft.ElevatedButton(
                                "Go Home",
                                bgcolor=COLOR_ACCENT,
                                color=COLOR_BG,
                                on_click=lambda _: self.page.go("/")
                            )
                        ],
                        horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                        spacing=20
                    ),
                    alignment=ft.alignment.center,
                    expand=True
                )
            )
        
        self.page.update()
    
    def toggle_advanced_mode(self, e):
        """Toggle advanced mode (reverse text and flip page)."""
        self.advanced_mode = e.control.value
        print(f"Advanced mode: {self.advanced_mode}")
        # Rebuild the view to apply transformations by triggering route change
        self.route_change(e)
    
    def apply_text_transform(self, text_control):
        """Apply text reversal transform if advanced mode is enabled."""
        if self.advanced_mode:
            # Wrap text in container with scaleX(-1) to reverse it horizontally
            # Use Scale object with scale_x=-1 for horizontal reversal
            # Try using the Scale class directly - if it doesn't exist, create it manually
            try:
                Scale = ft.transform.Scale
                scale_obj = Scale(scale_x=-1, scale_y=1)
            except AttributeError:
                # If Scale class doesn't exist, try creating it manually
                from dataclasses import dataclass, field
                from typing import Optional
                @dataclass
                class Scale:
                    scale: Optional[float] = field(default=None)
                    scale_x: Optional[float] = field(default=None)
                    scale_y: Optional[float] = field(default=None)
                    alignment: Optional[ft.Alignment] = field(default=None)
                scale_obj = Scale(scale_x=-1, scale_y=1)
            
            return ft.Container(
                content=text_control,
                scale=scale_obj,
                alignment=ft.alignment.center
            )
        return text_control
    
    def apply_page_transform(self, control):
        """Recursively apply text reversal to all text elements in a control tree."""
        if not self.advanced_mode:
            return control
        
        # If it's a Text control, wrap it
        if isinstance(control, ft.Text):
            return self.apply_text_transform(control)
        
        # Create a copy to avoid modifying the original
        import copy
        try:
            control_copy = copy.copy(control)
        except:
            control_copy = control
        
        # If it has a content attribute, transform it recursively
        if hasattr(control_copy, 'content') and control_copy.content is not None:
            if isinstance(control_copy.content, list):
                # For controls with lists of children
                control_copy.content = [self.apply_page_transform(c) for c in control_copy.content]
            else:
                # For controls with single content
                control_copy.content = self.apply_page_transform(control_copy.content)
        
        # If it has a controls attribute (like Column, Row), transform those
        if hasattr(control_copy, 'controls') and control_copy.controls is not None:
            control_copy.controls = [self.apply_page_transform(c) for c in control_copy.controls]
        
        # If it has an actions attribute (like AlertDialog), transform those
        if hasattr(control_copy, 'actions') and control_copy.actions is not None:
            control_copy.actions = [self.apply_page_transform(c) for c in control_copy.actions]
        
        return control_copy
    
    def view_pop(self, view):
        """Handle view pop (back button)."""
        self.page.views.pop()
        if len(self.page.views) > 0:
            top_view = self.page.views[-1]
            self.page.go(top_view.route)
        else:
            self.page.go("/")
    
    def open_vnc_viewer(self, vm_name: str):
        """Open VNC viewer for a VM."""
        if not self.vm_manager.is_vm_running(vm_name):
            self.show_error(f"VM '{vm_name}' is not running. Please start it first.")
            return
        
        # Navigate to VNC viewer route
        self.page.go(f"/vnc/{vm_name}")
    
    def build_vnc_viewer_content(self, vm_name: str) -> ft.Container:
        """Build the VNC viewer content with WebView."""
        # Update AppBar for VNC viewer
        self.page.appbar = ft.AppBar(
            title=ft.Text(f"VNC Viewer - {vm_name}", color=COLOR_TEXT),
            bgcolor=COLOR_BG,
            color=COLOR_ACCENT,
            actions=[
                ft.IconButton(
                    ft.Icons.ARROW_BACK,
                    icon_color=COLOR_ACCENT,
                    on_click=lambda e: self.page.go("/")
                ),
                ft.Switch(
                    label="Advanced Mode",
                    value=self.advanced_mode,
                    label_style=ft.TextStyle(color=COLOR_ACCENT),
                    on_change=self.toggle_advanced_mode
                )
            ]
        )
        
        # Start websockify proxy
        websocket_port = self.vm_operations.start_websockify(vm_name, vnc_port=5900)
        
        if websocket_port is None:
            # Show error if websockify not found
            return ft.Container(
                content=ft.Column(
                    controls=[
                        ft.Text(
                            "VNC Viewer",
                            size=24,
                            weight=ft.FontWeight.BOLD,
                            color=COLOR_ACCENT
                        ),
                        ft.Text(
                            "Error: websockify not found. Please install it:",
                            size=16,
                            color=COLOR_TEXT
                        ),
                        ft.Text(
                            "pip install websockify",
                            size=14,
                            color=COLOR_ACCENT,
                            selectable=True
                        ),
                        ft.Text(
                            "Or on macOS: brew install websockify",
                            size=14,
                            color=COLOR_ACCENT,
                            selectable=True
                        ),
                        ft.ElevatedButton(
                            "Back",
                            bgcolor=COLOR_ACCENT,
                            color=COLOR_BG,
                            on_click=lambda e: self.page.go("/")
                        )
                    ],
                    spacing=20,
                    horizontal_alignment=ft.CrossAxisAlignment.CENTER
                ),
                expand=True,
                alignment=ft.alignment.center
            )
        
        # Generate noVNC HTML
        novnc_html = self.generate_novnc_html(websocket_port)
        
        # Convert HTML to data URL (WebView must be added to page before load_html can be called)
        # So we'll use data URL directly in the url property
        import base64
        html_encoded = base64.b64encode(novnc_html.encode('utf-8')).decode('utf-8')
        data_url = f"data:text/html;charset=utf-8;base64,{html_encoded}"
        
        # Create WebView with noVNC using flet_webview (per Flet docs)
        # According to docs: use flet_webview.WebView instead of ft.WebView
        # Set url directly - WebView must be added to page before load_html() can be called
        webview = ftwv.WebView(
            url=data_url,
            on_page_started=lambda _: print("VNC page started loading"),
            on_page_ended=lambda _: print("VNC page finished loading"),
            on_web_resource_error=lambda e: print(f"VNC page error: {e.data}"),
            expand=True,
            enable_javascript=True
        )
        
        print(f"Created WebView with noVNC, connecting to ws://127.0.0.1:{websocket_port}")
        
        # For VNC viewer, remove padding to allow full-screen view
        self.content_container.padding = 0
        
        return ft.Container(
            content=webview,
            expand=True,
            bgcolor=COLOR_BG
        )
    
    def generate_novnc_html(self, websocket_port: int) -> str:
        """Generate noVNC HTML for WebView."""
        # Use noVNC from official CDN (jsdelivr)
        # Using @novnc/core which is the modern noVNC library
        return f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>noVNC - VM Viewer</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        html, body {{
            width: 100%;
            height: 100%;
            overflow: hidden;
            background-color: #000;
        }}
        #noVNC_screen {{
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
        }}
        .loading {{
            color: #fff;
            font-family: Arial, sans-serif;
            font-size: 16px;
        }}
    </style>
    <script src="https://cdn.jsdelivr.net/npm/@novnc/core@7.0.0/lib/rfb.min.js"></script>
</head>
<body>
    <div id="noVNC_screen">
        <div class="loading">Connecting to VNC server...</div>
    </div>
    <script>
        let rfb;
        const screen = document.getElementById('noVNC_screen');
        
        function connectVNC() {{
            try {{
                // Clear loading message
                screen.innerHTML = '';
                
                rfb = new RFB({{
                    target: screen,
                    encrypt: false,
                    wsProtocols: ['binary'],
                    credentials: {{ password: '' }}
                }});
                
                rfb.scaleViewport = true;
                rfb.resizeSession = true;
                rfb.background = '#000000';
                
                rfb.addEventListener("connect", () => {{
                    console.log("Connected to VNC server");
                }});
                
                rfb.addEventListener("disconnect", (e) => {{
                    const reason = e.detail.clean ? "clean" : "unclean";
                    console.log("Disconnected from VNC server:", reason);
                    screen.innerHTML = '<div class="loading">Disconnected from VNC server</div>';
                }});
                
                rfb.addEventListener("credentialsrequired", () => {{
                    console.log("Credentials required (if any)");
                }});
                
                // Connect to websockify proxy
                rfb.connect('ws://127.0.0.1:{websocket_port}');
            }} catch (error) {{
                console.error("Error initializing VNC:", error);
                screen.innerHTML = '<div class="loading">Error: ' + error.message + '</div>';
            }}
        }}
        
        // Connect when page loads
        window.addEventListener('load', connectVNC);
    </script>
</body>
</html>
"""
    
    def build_vm_list_view(self):
        """Build the main VM list view content."""
        # Header with Create button
        header = ft.Container(
            content=ft.Row(
                controls=[
                    ft.Text(
                        "VM Manager",
                        size=32,
                        weight=ft.FontWeight.BOLD,
                        color=COLOR_ACCENT
                    ),
                    ft.Container(expand=True),
                    ft.ElevatedButton(
                        "Create VM",
                        bgcolor=COLOR_ACCENT,
                        color=COLOR_BG,
                        on_click=self.show_create_dialog
                    )
                ],
                alignment=ft.MainAxisAlignment.SPACE_BETWEEN
            ),
            padding=ft.padding.only(bottom=20)
        )
        
        # VM List
        self.vm_list_view = ft.Column(
            controls=[],
            spacing=10,
            scroll=ft.ScrollMode.AUTO,
            expand=True
        )
        
        self.refresh_vm_list()
        
        return ft.Column(
            controls=[
                header,
                self.vm_list_view
            ],
            expand=True
        )
    
    def refresh_vm_list(self):
        """Refresh the VM list display."""
        if self.vm_list_view is None:
            return
        
        self.vm_list_view.controls.clear()
        
        vms = self.vm_manager.list_vms()
        
        if not vms:
            self.vm_list_view.controls.append(
                ft.Container(
                    content=ft.Text(
                        "No VMs found. Click 'Create VM' to get started.",
                        size=16,
                        color=COLOR_TEXT_SECONDARY,
                        text_align=ft.TextAlign.CENTER
                    ),
                    padding=40,
                    alignment=ft.alignment.center
                )
            )
        else:
            for vm_name in vms:
                config = self.vm_manager.get_vm_config(vm_name)
                if config:
                    vm_card = self.create_vm_card(vm_name, config)
                    self.vm_list_view.controls.append(vm_card)
        
        # Only update if page is available and not in the middle of a dialog operation
        try:
            self.page.update()
        except Exception:
            # If update fails, it's likely because we're in the middle of another update
            # This is okay, the next update will catch it
            pass
    
    def create_vm_card(self, vm_name: str, config: VMConfig) -> ft.Container:
        """Create a card for a VM."""
        # Check for custom status first (e.g., during creation)
        if vm_name in self.vm_status:
            status_text = self.vm_status[vm_name]
            # Status colors for different states
            if "Downloading" in status_text or "Preparing" in status_text or "Creating" in status_text:
                status_color = COLOR_ACCENT  # Green for in-progress
            elif status_text == "Running":
                status_color = COLOR_ACCENT
            else:
                status_color = COLOR_TEXT_SECONDARY
            # For custom status, check if VM is actually running
            is_running = self.vm_manager.is_vm_running(vm_name)
        else:
            # Default status check
            is_running = self.vm_manager.is_vm_running(vm_name)
            status_text = "Running" if is_running else "Stopped"
            status_color = COLOR_ACCENT if is_running else COLOR_TEXT_SECONDARY
        
        # Make the card clickable to open VNC viewer
        card = ft.Container(
            content=ft.Column(
                controls=[
                    ft.Row(
                        controls=[
                            ft.Text(
                                vm_name,
                                size=20,
                                weight=ft.FontWeight.BOLD,
                                color=COLOR_TEXT,
                                expand=True
                            ),
                            ft.Container(
                                content=ft.Text(
                                    status_text,
                                    size=12,
                                    color=status_color,
                                    weight=ft.FontWeight.W_500
                                ),
                                padding=ft.padding.symmetric(horizontal=12, vertical=6),
                                bgcolor=COLOR_ACCENT_DARK if ("Running" in status_text or "Downloading" in status_text or "Preparing" in status_text or "Creating" in status_text) else COLOR_BG,
                                border_radius=12
                            )
                        ],
                        alignment=ft.MainAxisAlignment.SPACE_BETWEEN
                    ),
                    ft.Row(
                        controls=[
                            ft.Text(
                                f"CPU: {config.cpu_cores} cores",
                                size=14,
                                color=COLOR_TEXT_SECONDARY
                            ),
                            ft.Text(
                                f"RAM: {config.ram_gb} GB",
                                size=14,
                                color=COLOR_TEXT_SECONDARY
                            ),
                            ft.Text(
                                f"Disk: {config.disk_size_gb} GB",
                                size=14,
                                color=COLOR_TEXT_SECONDARY
                            )
                        ],
                        spacing=20
                    ),
                    ft.Row(
                        controls=[
                            ft.ElevatedButton(
                                "Start" if not is_running else "Stop",
                                bgcolor=COLOR_ACCENT if not is_running else COLOR_ACCENT_DARK,
                                color=COLOR_BG,
                                on_click=lambda e, name=vm_name: self.toggle_vm(name)
                            ),
                            ft.ElevatedButton(
                                "View",
                                bgcolor=COLOR_ACCENT if is_running else COLOR_ACCENT_DARK,
                                color=COLOR_BG,
                                on_click=lambda e, name=vm_name: self.open_vnc_viewer(name),
                                disabled=not is_running,
                                tooltip="Open VNC viewer" if is_running else "Start VM first to view"
                            ),
                            ft.OutlinedButton(
                                "Edit",
                                style=ft.ButtonStyle(color=COLOR_ACCENT),
                                on_click=lambda e, name=vm_name: self.show_edit_dialog(name)
                            ),
                            ft.OutlinedButton(
                                "Delete",
                                style=ft.ButtonStyle(color=COLOR_ACCENT),
                                on_click=lambda e, name=vm_name: self.show_delete_dialog(name)
                            )
                        ],
                        spacing=10
                    )
                ],
                spacing=10
            ),
            padding=20,
            bgcolor="#2a2a2a",
            border_radius=8,
            border=ft.border.all(1, COLOR_ACCENT_DARK)
        )
        
        return card
    
    def show_create_dialog(self, e):
        """Show dialog to create a new VM."""
        print("Create VM button clicked")
        try:
            name_field = ft.TextField(
                label="VM Name",
                hint_text="Enter VM name",
                color=COLOR_TEXT,
                bgcolor="#333333",
                border_color=COLOR_ACCENT_DARK,
                label_style=ft.TextStyle(color=COLOR_ACCENT),
                hint_style=ft.TextStyle(color=COLOR_TEXT_SECONDARY)
            )
            
            cpu_field = ft.Slider(
                label="CPU Cores",
                min=1,
                max=16,
                divisions=15,
                value=8,
                active_color=COLOR_ACCENT,
                inactive_color=COLOR_ACCENT_DARK
            )
            cpu_text = ft.Text("8 cores", color=COLOR_TEXT_SECONDARY)
            
            def cpu_changed(e):
                cpu_text.value = f"{int(cpu_field.value)} cores"
                self.page.update()
            
            cpu_field.on_change = cpu_changed
            
            ram_field = ft.Slider(
                label="RAM (GB)",
                min=2,
                max=32,
                divisions=30,
                value=8,
                active_color=COLOR_ACCENT,
                inactive_color=COLOR_ACCENT_DARK
            )
            ram_text = ft.Text("8 GB", color=COLOR_TEXT_SECONDARY)
            
            def ram_changed(e):
                ram_text.value = f"{int(ram_field.value)} GB"
                self.page.update()
            
            ram_field.on_change = ram_changed
            
            disk_field = ft.TextField(
                label="Disk Size (GB)",
                value="64",
                color=COLOR_TEXT,
                bgcolor="#333333",
                border_color=COLOR_ACCENT_DARK,
                label_style=ft.TextStyle(color=COLOR_ACCENT),
                hint_style=ft.TextStyle(color=COLOR_TEXT_SECONDARY)
            )
            
            def create_vm(e):
                name = name_field.value.strip()
                if not name:
                    self.show_error("VM name cannot be empty")
                    return
                
                try:
                    cpu_cores = int(cpu_field.value)
                    ram_gb = int(ram_field.value)
                    disk_gb = int(disk_field.value)
                    
                    if disk_gb < 20:
                        self.show_error("Disk size must be at least 20 GB")
                        return
                    
                    self.page.close(dialog)
                    self.create_vm_workflow(name, cpu_cores, ram_gb, disk_gb)
                except ValueError:
                    self.show_error("Invalid numeric value")
            
            # Create dialog with explicit styling
            dialog_content = ft.Container(
                content=ft.Column(
                    controls=[
                        name_field,
                        ft.Row([cpu_field, cpu_text], spacing=10),
                        ft.Row([ram_field, ram_text], spacing=10),
                        disk_field
                    ],
                    spacing=15,
                    tight=True,
                    scroll=ft.ScrollMode.AUTO
                ),
                width=500,
                height=400,
                padding=20,
                bgcolor="#2a2a2a"
            )
            
            dialog = ft.AlertDialog(
                modal=True,
                title=ft.Text("Create New VM", color=COLOR_TEXT, size=20, weight=ft.FontWeight.BOLD),
                content=dialog_content,
                actions=[
                    ft.TextButton(
                        "Cancel",
                        style=ft.ButtonStyle(color=COLOR_ACCENT),
                        on_click=lambda e: self.page.close(dialog)
                    ),
                    ft.ElevatedButton(
                        "Create",
                        bgcolor=COLOR_ACCENT,
                        color=COLOR_BG,
                        on_click=create_vm
                    )
                ],
                bgcolor=COLOR_BG,
                actions_alignment=ft.MainAxisAlignment.END,
                shape=ft.RoundedRectangleBorder(radius=8)
            )
            
            # Open dialog using page.open()
            self.page.open(dialog)
            print("Create VM dialog opened")
        except Exception as ex:
            print(f"Error showing create dialog: {ex}")
            import traceback
            traceback.print_exc()
            self.show_error(f"Error opening create dialog: {str(ex)}")
    
    def show_edit_dialog(self, vm_name: str):
        """Show dialog to edit a VM."""
        config = self.vm_manager.get_vm_config(vm_name)
        if not config:
            self.show_error(f"VM '{vm_name}' not found")
            return
        
        name_field = ft.TextField(
            label="VM Name",
            value=config.name,
            color=COLOR_TEXT,
            bgcolor="#333333",
            border_color=COLOR_ACCENT_DARK,
            label_style=ft.TextStyle(color=COLOR_ACCENT),
            hint_style=ft.TextStyle(color=COLOR_TEXT_SECONDARY)
        )
        
        cpu_field = ft.Slider(
            label="CPU Cores",
            min=1,
            max=16,
            divisions=15,
            value=config.cpu_cores,
            active_color=COLOR_ACCENT,
            inactive_color=COLOR_ACCENT_DARK
        )
        cpu_text = ft.Text(f"{config.cpu_cores} cores", color=COLOR_TEXT_SECONDARY)
        
        def cpu_changed(e):
            cpu_text.value = f"{int(cpu_field.value)} cores"
            self.page.update()
        
        cpu_field.on_change = cpu_changed
        
        ram_field = ft.Slider(
            label="RAM (GB)",
            min=2,
            max=32,
            divisions=30,
            value=config.ram_gb,
            active_color=COLOR_ACCENT,
            inactive_color=COLOR_ACCENT_DARK
        )
        ram_text = ft.Text(f"{config.ram_gb} GB", color=COLOR_TEXT_SECONDARY)
        
        def ram_changed(e):
            ram_text.value = f"{int(ram_field.value)} GB"
            self.page.update()
        
        ram_field.on_change = ram_changed
        
        disk_field = ft.TextField(
            label="Disk Size (GB)",
            value=str(config.disk_size_gb),
            disabled=True,
            color=COLOR_TEXT_SECONDARY,
            bgcolor="#2a2a2a",
            border_color=COLOR_ACCENT_DARK,
            label_style=ft.TextStyle(color=COLOR_ACCENT),
            hint_style=ft.TextStyle(color=COLOR_TEXT_SECONDARY)
        )
        
        def edit_vm(e):
            new_name = name_field.value.strip()
            if not new_name:
                self.show_error("VM name cannot be empty")
                return
            
            try:
                cpu_cores = int(cpu_field.value)
                ram_gb = int(ram_field.value)
                
                self.page.close(dialog)
                
                if self.vm_manager.edit_vm(vm_name, new_name, cpu_cores, ram_gb):
                    self.show_success(f"VM '{new_name}' updated successfully")
                    self.refresh_vm_list()
                else:
                    self.show_error(f"Failed to update VM '{vm_name}'")
            except ValueError:
                self.show_error("Invalid numeric value")
        
        dialog = ft.AlertDialog(
            modal=True,
            title=ft.Text("Edit VM", color=COLOR_TEXT),
            content=ft.Container(
                content=ft.Column(
                    controls=[
                        name_field,
                        ft.Row([cpu_field, cpu_text]),
                        ft.Row([ram_field, ram_text]),
                        disk_field
                    ],
                    spacing=15,
                    tight=True
                ),
                width=400,
                padding=20
            ),
            actions=[
                ft.TextButton("Cancel", style=ft.ButtonStyle(color=COLOR_ACCENT), on_click=lambda e: self.page.close(dialog)),
                ft.ElevatedButton(
                    "Save",
                    bgcolor=COLOR_ACCENT,
                    color=COLOR_BG,
                    on_click=edit_vm
                )
            ],
            bgcolor=COLOR_BG,
            actions_alignment=ft.MainAxisAlignment.END
        )
        
        self.page.open(dialog)
    
    def show_delete_dialog(self, vm_name: str):
        """Show confirmation dialog to delete a VM."""
        def delete_vm(e):
            def perform_delete():
                self.page.close(dialog)
                
                if self.vm_manager.delete_vm(vm_name):
                    self.show_success(f"VM '{vm_name}' deleted successfully")
                    self.refresh_vm_list()
                else:
                    self.show_error(f"Failed to delete VM '{vm_name}'")
            self.ensure_sudo_password(perform_delete)
        
        dialog = ft.AlertDialog(
            modal=True,
            title=ft.Text("Delete VM", color=COLOR_TEXT),
            content=ft.Text(
                f"Are you sure you want to delete '{vm_name}'? This will remove all VM files and cannot be undone.",
                color=COLOR_TEXT_SECONDARY
            ),
            actions=[
                ft.TextButton("Cancel", style=ft.ButtonStyle(color=COLOR_ACCENT), on_click=lambda e: self.page.close(dialog)),
                ft.ElevatedButton(
                    "Delete",
                    bgcolor="#ff4444",
                    color=COLOR_TEXT,
                    on_click=delete_vm
                )
            ],
            bgcolor=COLOR_BG,
            actions_alignment=ft.MainAxisAlignment.END
        )
        
        self.page.open(dialog)
    
    def toggle_vm(self, vm_name: str):
        """Start or stop a VM."""
        is_running = self.vm_manager.is_vm_running(vm_name)
        
        if is_running:
            if self.vm_operations.stop_vm(vm_name):
                self.show_success(f"VM '{vm_name}' stopped")
            else:
                self.show_error(f"Failed to stop VM '{vm_name}'")
        else:
            config = self.vm_manager.get_vm_config(vm_name)
            if not config:
                self.show_error(f"VM '{vm_name}' not found")
                return
            
            if self.vm_operations.start_vm(vm_name, config):
                self.show_success(f"VM '{vm_name}' started. Connect via VNC at 127.0.0.1:5900")
            else:
                self.show_error(f"Failed to start VM '{vm_name}'")
        
        self.refresh_vm_list()
    
    def update_sudo_password(self, password: str):
        """Store sudo password and propagate to managers."""
        self.sudo_password = password
        self.vm_operations.set_sudo_password(password)
        self.vm_manager.set_sudo_password(password)
    
    def ensure_sudo_password(self, on_ready: Callable[[], None]):
        """Ensure sudo password is available before running privileged steps."""
        if self.sudo_password:
            # Re-set password on managers in case they were recreated
            self.vm_operations.set_sudo_password(self.sudo_password)
            self.vm_manager.set_sudo_password(self.sudo_password)
            on_ready()
            return
        
        password_field = ft.TextField(
            label="sudo Password",
            password=True,
            can_reveal_password=True,
            autofocus=True,
            bgcolor="#333333",
            border_color=COLOR_ACCENT_DARK,
            color=COLOR_TEXT,
            label_style=ft.TextStyle(color=COLOR_ACCENT),
            hint_style=ft.TextStyle(color=COLOR_TEXT_SECONDARY),
            hint_text="Enter your macOS account password"
        )
        error_text = ft.Text("", color="#ff4444")
        
        def submit_password(e):
            password = password_field.value or ""
            if not password:
                error_text.value = "Password is required."
                self.page.update()
                return
            self.update_sudo_password(password)
            self.page.close(dialog)
            on_ready()
        
        def cancel_password(e):
            self.page.close(dialog)
            self.show_error("sudo password is required to continue.")
        
        dialog = ft.AlertDialog(
            modal=True,
            title=ft.Text("sudo Access Required", color=COLOR_TEXT),
            content=ft.Column(
                controls=[
                    ft.Text(
                        "Some steps require elevated privileges. "
                        "Enter your macOS account password.",
                        color=COLOR_TEXT_SECONDARY
                    ),
                    password_field,
                    error_text
                ],
                spacing=10,
                tight=True
            ),
            actions=[
                ft.TextButton(
                    "Cancel",
                    style=ft.ButtonStyle(color=COLOR_ACCENT),
                    on_click=cancel_password
                ),
                ft.ElevatedButton(
                    "Continue",
                    bgcolor=COLOR_ACCENT,
                    color=COLOR_BG,
                    on_click=submit_password
                )
            ],
            bgcolor=COLOR_BG,
            actions_alignment=ft.MainAxisAlignment.END
        )
        
        self.page.open(dialog)
    
    def create_vm_workflow(self, name: str, cpu_cores: int, ram_gb: int, disk_gb: int):
        """Wrapper to ensure sudo password before running workflow."""
        def start_workflow():
            self._execute_create_vm_workflow(name, cpu_cores, ram_gb, disk_gb)
        self.ensure_sudo_password(start_workflow)
    
    def _execute_create_vm_workflow(self, name: str, cpu_cores: int, ram_gb: int, disk_gb: int):
        """Complete workflow to create a VM."""
        # Show progress dialog
        progress_dialog = ft.AlertDialog(
            modal=True,
            title=ft.Text("Creating VM", color=COLOR_TEXT),
            content=ft.Column(
                controls=[
                    ft.ProgressRing(color=COLOR_ACCENT),
                    ft.Text("Initializing...", color=COLOR_TEXT_SECONDARY, size=14)
                ],
                tight=True,
                horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                spacing=15
            ),
            bgcolor=COLOR_BG
        )
        
        self.page.open(progress_dialog)
        self.page.update()  # Ensure dialog is added to page first
        
        def update_progress(message: str):
            """Update progress dialog and VM status in list."""
            # Update VM status for real-time display
            self.vm_status[name] = message
            
            # Update progress dialog content if it's still open
            if progress_dialog.open and len(progress_dialog.content.controls) > 1:
                progress_dialog.content.controls[1].value = message
            
            # Refresh VM list (this will call page.update() internally)
            self.refresh_vm_list()
        
        try:
            # Step 1: Create VM config
            update_progress("Creating VM configuration...")
            if not self.vm_manager.create_vm(name, cpu_cores, ram_gb, disk_gb):
                self.vm_status.pop(name, None)
                self.page.close(progress_dialog)
                self.show_error(f"Failed to create VM '{name}'. It may already exist.")
                self.refresh_vm_list()
                return
            
            # VM now exists, refresh list to show it
            self.refresh_vm_list()
            
            # Step 2: Create disk image
            update_progress("Creating disk image...")
            if not self.vm_operations.create_vm_disk(name, disk_gb):
                self.vm_status.pop(name, None)
                self.page.close(progress_dialog)
                self.show_error("Failed to create disk image")
                self.refresh_vm_list()
                return
            
            # Step 3: Download ISO if needed
            update_progress("Downloading Windows ISO...")
            if not self.vm_operations.download_windows_iso():
                self.vm_status.pop(name, None)
                self.page.close(progress_dialog)
                self.show_error("Failed to download Windows ISO")
                self.refresh_vm_list()
                return
            
            # Step 4: Prepare modified ISO
            update_progress("Preparing modified ISO (this may take several minutes)...")
            if not self.vm_operations.prepare_iso_for_vm(name, update_progress):
                self.vm_status.pop(name, None)
                self.page.close(progress_dialog)
                self.show_error("Failed to prepare modified ISO")
                self.refresh_vm_list()
                return
            
            # Success - clear status and show as ready
            self.vm_status.pop(name, None)
            self.page.close(progress_dialog)
            self.show_success(f"VM '{name}' created successfully!")
            self.refresh_vm_list()
            
        except Exception as e:
            self.vm_status.pop(name, None)
            self.page.close(progress_dialog)
            self.show_error(f"Error creating VM: {str(e)}")
            self.refresh_vm_list()
    
    def show_error(self, message: str):
        """Show an error message."""
        dialog = ft.AlertDialog(
            modal=True,
            title=ft.Text("Error", color="#ff4444"),
            content=ft.Text(message, color=COLOR_TEXT_SECONDARY),
            actions=[
                ft.ElevatedButton(
                    "OK",
                    bgcolor=COLOR_ACCENT,
                    color=COLOR_BG,
                    on_click=lambda e: self.page.close(dialog)
                )
            ],
            bgcolor=COLOR_BG,
            actions_alignment=ft.MainAxisAlignment.END
        )
        
        self.page.open(dialog)
    
    def show_success(self, message: str):
        """Show a success message."""
        dialog = ft.AlertDialog(
            modal=True,
            title=ft.Text("Success", color=COLOR_ACCENT),
            content=ft.Text(message, color=COLOR_TEXT_SECONDARY),
            actions=[
                ft.ElevatedButton(
                    "OK",
                    bgcolor=COLOR_ACCENT,
                    color=COLOR_BG,
                    on_click=lambda e: self.page.close(dialog)
                )
            ],
            bgcolor=COLOR_BG,
            actions_alignment=ft.MainAxisAlignment.END
        )
        
        self.page.open(dialog)


def main(page: ft.Page):
    """Main entry point."""
    try:
        print("Initializing VM Manager App...")
        app = VMManagerApp(page)
        print("VM Manager App initialized successfully")
    except Exception as e:
        print(f"Error initializing app: {e}")
        import traceback
        traceback.print_exc()
        # Show error in UI if possible
        try:
            page.add(ft.Text(f"Error: {str(e)}", color="#ff4444"))
            page.update()
        except:
            pass


if __name__ == "__main__":
    ft.app(target=main)

