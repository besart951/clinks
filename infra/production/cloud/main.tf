terraform {
  required_providers {
    openstack = {
      source  = "terraform-provider-openstack/openstack"
      version = "3.4.0"
    }
  }
}
# Credentials come from OS_CLOUD / clouds.yaml outside the checkout.
provider "openstack" {}

variable "external_network_id" { type = string }
variable "external_network_name" { type = string }
variable "image_id" { type = string }
variable "flavor_id" { type = string }
variable "keypair" { type = string }
variable "admin_cidr" {
  type = string
  validation {
    condition     = can(cidrnetmask(var.admin_cidr)) && !endswith(var.admin_cidr, "/0")
    error_message = "Supply the IPv4 management network."
  }
}
variable "private_cidr" {
  type    = string
  default = "10.72.0.0/24"
}
resource "openstack_networking_network_v2" "private" { name = "clinks-private" }
resource "openstack_networking_subnet_v2" "private" {
  name       = "clinks-private"
  network_id = openstack_networking_network_v2.private.id
  cidr       = var.private_cidr
  ip_version = 4
}
resource "openstack_networking_router_v2" "edge" {
  name                = "clinks"
  external_network_id = var.external_network_id
}
resource "openstack_networking_router_interface_v2" "private" {
  router_id = openstack_networking_router_v2.edge.id
  subnet_id = openstack_networking_subnet_v2.private.id
}
resource "openstack_networking_secgroup_v2" "web" { name = "clinks-ingress" }
resource "openstack_networking_secgroup_rule_v2" "ingress" {
  for_each          = { ssh = 22, http = 80, https = 443 }
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = each.value
  port_range_max    = each.value
  remote_ip_prefix  = each.key == "ssh" ? var.admin_cidr : "0.0.0.0/0"
  security_group_id = openstack_networking_secgroup_v2.web.id
}
resource "openstack_networking_port_v2" "web" {
  name               = "clinks-edge"
  network_id         = openstack_networking_network_v2.private.id
  security_group_ids = [openstack_networking_secgroup_v2.web.id]
  fixed_ip { subnet_id = openstack_networking_subnet_v2.private.id }
}
resource "openstack_compute_instance_v2" "web" {
  name      = "clinks"
  flavor_id = var.flavor_id
  image_id  = var.image_id
  key_pair  = var.keypair
  network { port = openstack_networking_port_v2.web.id }
}
resource "openstack_networking_floatingip_v2" "web" { pool = var.external_network_name }
resource "openstack_networking_floatingip_associate_v2" "web" {
  floating_ip = openstack_networking_floatingip_v2.web.address
  port_id     = openstack_networking_port_v2.web.id
  depends_on  = [openstack_networking_router_interface_v2.private]
}
output "edge_address" { value = openstack_networking_floatingip_v2.web.address }
