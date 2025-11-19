"""Main Flet application for VM Manager."""

import flet as ft
import os
import sys
from pathlib import Path
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
            
            # Set up routing
            self.page.on_route_change = self.route_change
            self.page.on_view_pop = self.view_pop
            
            print("Setting up routing...")
            self.page.go(self.page.route)
            print("UI setup complete")
        except Exception as e:
            print(f"Error in VMManagerApp.__init__: {e}")
            import traceback
            traceback.print_exc()
            raise
    
    def route_change(self, route):
        """Handle route changes and build views."""
        self.page.views.clear()
        
        # Main VM list view
        self.page.views.append(
            ft.View(
                "/",
                [
                    ft.AppBar(
                        title=ft.Text("VM Manager", color=COLOR_TEXT),
                        bgcolor=COLOR_BG,
                        color=COLOR_ACCENT
                    ),
                    self.build_vm_list_view()
                ],
                bgcolor=COLOR_BG,
                padding=20
            )
        )
        
        self.page.update()
    
    def view_pop(self, view):
        """Handle view pop (back button)."""
        self.page.views.pop()
        top_view = self.page.views[-1]
        self.page.go(top_view.route)
    
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
        
        self.page.update()
    
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
        else:
            # Default status check
            is_running = self.vm_manager.is_vm_running(vm_name)
            status_text = "Running" if is_running else "Stopped"
            status_color = COLOR_ACCENT if is_running else COLOR_TEXT_SECONDARY
        
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
                            ft.OutlinedButton(
                                "Edit",
                                color=COLOR_ACCENT,
                                on_click=lambda e, name=vm_name: self.show_edit_dialog(name)
                            ),
                            ft.OutlinedButton(
                                "Delete",
                                color=COLOR_ACCENT,
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
                        color=COLOR_ACCENT,
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
                ft.TextButton("Cancel", color=COLOR_ACCENT, on_click=lambda e: self.page.close(dialog)),
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
            self.page.close(dialog)
            
            if self.vm_manager.delete_vm(vm_name):
                self.show_success(f"VM '{vm_name}' deleted successfully")
                self.refresh_vm_list()
            else:
                self.show_error(f"Failed to delete VM '{vm_name}'")
        
        dialog = ft.AlertDialog(
            modal=True,
            title=ft.Text("Delete VM", color=COLOR_TEXT),
            content=ft.Text(
                f"Are you sure you want to delete '{vm_name}'? This will remove all VM files and cannot be undone.",
                color=COLOR_TEXT_SECONDARY
            ),
            actions=[
                ft.TextButton("Cancel", color=COLOR_ACCENT, on_click=lambda e: self.page.close(dialog)),
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
    
    def create_vm_workflow(self, name: str, cpu_cores: int, ram_gb: int, disk_gb: int):
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
        
        def update_progress(message: str):
            """Update progress dialog and VM status in list."""
            progress_dialog.content.controls[1].value = message
            # Update VM status for real-time display
            self.vm_status[name] = message
            self.refresh_vm_list()
            self.page.update()
        
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

