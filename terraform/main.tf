provider "aws" {
  region = var.aws_region
}

# 1. Network VPC Setup
resource "aws_vpc" "platform_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags = {
    Name = "delivery-platform-vpc"
  }
}

# Subnets
resource "aws_subnet" "public_subnet_a" {
  vpc_id            = aws_vpc.platform_vpc.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "${var.aws_region}a"
  map_public_ip_on_launch = true
}

resource "aws_subnet" "public_subnet_b" {
  vpc_id            = aws_vpc.platform_vpc.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "${var.aws_region}b"
  map_public_ip_on_launch = true
}

resource "aws_subnet" "private_subnet_a" {
  vpc_id            = aws_vpc.platform_vpc.id
  cidr_block        = "10.0.3.0/24"
  availability_zone = "${var.aws_region}a"
}

resource "aws_subnet" "private_subnet_b" {
  vpc_id            = aws_vpc.platform_vpc.id
  cidr_block        = "10.0.4.0/24"
  availability_zone = "${var.aws_region}b"
}

# Internet Gateway
resource "aws_internet_gateway" "gw" {
  vpc_id = aws_vpc.platform_vpc.id
}

# Route Tables
resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.platform_vpc.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.gw.id
  }
}

resource "aws_route_table_association" "pub_a" {
  subnet_id      = aws_subnet.public_subnet_a.id
  route_table_id = aws_route_table.public_rt.id
}

resource "aws_route_table_association" "pub_b" {
  subnet_id      = aws_subnet.public_subnet_b.id
  route_table_id = aws_route_table.public_rt.id
}

# 2. Security Groups

# Public Security Group: Restrict access to Nginx load balancer (exposed to internet)
resource "aws_security_group" "public_nginx_sg" {
  name        = "nginx-public-security-group"
  description = "Allows public incoming HTTP/HTTPS traffic to Nginx Load Balancer"
  vpc_id      = aws_vpc.platform_vpc.id

  ingress {
    description = "HTTP Ingress"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS Ingress"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # SSH for remote management
  ingress {
    description = "SSH Ingress"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.my_ip_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Private Security Group: Restrict database, redis, and telemetry ports to internal VPC traffic only
resource "aws_security_group" "private_resources_sg" {
  name        = "private-resources-security-group"
  description = "Restricts incoming traffic for databases, redis, and prometheus/grafana to VPC cidr block"
  vpc_id      = aws_vpc.platform_vpc.id

  ingress {
    description = "PostgreSQL Ingress (VPC internal)"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.platform_vpc.cidr_block]
  }

  ingress {
    description = "Redis Ingress (VPC internal)"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.platform_vpc.cidr_block]
  }

  ingress {
    description = "FastAPI Backend API Ingress"
    from_port   = 8000
    to_port     = 8000
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.platform_vpc.cidr_block]
  }

  ingress {
    description = "Prometheus Metrics Scraper"
    from_port   = 9090
    to_port     = 9090
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.platform_vpc.cidr_block]
  }

  ingress {
    description = "Grafana Dashboard UI"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.platform_vpc.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# 3. AWS RDS PostgreSQL Database Setup
resource "aws_db_subnet_group" "db_subnets" {
  name       = "platform-db-subnet-group"
  subnet_ids = [aws_subnet.private_subnet_a.id, aws_subnet.private_subnet_b.id]
}

resource "aws_db_instance" "postgres_db" {
  allocated_storage      = 20
  db_name                = "delivery_platform"
  engine                 = "postgres"
  engine_version         = "15.4"
  instance_class         = "db.t3.micro"
  username               = "postgres"
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.db_subnets.name
  vpc_security_group_ids = [aws_security_group.private_resources_sg.id]
  skip_final_snapshot    = true
}

# 4. AWS ElastiCache Redis Setup
resource "aws_elasticache_subnet_group" "cache_subnets" {
  name       = "platform-cache-subnet-group"
  subnet_ids = [aws_subnet.private_subnet_a.id, aws_subnet.private_subnet_b.id]
}

resource "aws_elasticache_cluster" "redis_cache" {
  cluster_id           = "platform-redis-cluster"
  engine               = "redis"
  node_type            = "cache.t3.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.cache_subnets.name
  security_group_ids   = [aws_security_group.private_resources_sg.id]
}

# 5. EC2 Host Instance (Docker Host)
resource "aws_instance" "app_host" {
  ami           = var.ami_id
  instance_type = "t3.medium"
  subnet_id     = aws_subnet.public_subnet_a.id
  key_name      = var.ssh_key_name
  vpc_security_group_ids = [
    aws_security_group.public_nginx_sg.id,
    aws_security_group.private_resources_sg.id
  ]

  tags = {
    Name = "delivery-platform-app-host"
  }
}
