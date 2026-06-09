variable "aws_region" {
  type        = string
  description = "AWS deployment target region"
  default     = "us-east-1"
}

variable "db_password" {
  type        = string
  description = "Master password for PostgreSQL RDS instance"
  sensitive   = true
}

variable "ami_id" {
  type        = string
  description = "Target Amazon Machine Image for EC2 docker host (defaults to Ubuntu 22.04 LTS)"
  default     = "ami-0c7217cdde317cfec" # Replace with valid Ubuntu AMI in target region
}

variable "ssh_key_name" {
  type        = string
  description = "Name of EC2 Key Pair for SSH remote management access"
}

variable "my_ip_cidr" {
  type        = string
  description = "Your local outbound IP in CIDR format (e.g. 192.168.1.1/32) to secure SSH access"
  default     = "0.0.0.0/0"
}
