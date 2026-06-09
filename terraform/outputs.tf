output "ec2_public_ip" {
  value       = aws_instance.app_host.public_ip
  description = "Public IP address of EC2 Application Host"
}

output "rds_endpoint" {
  value       = aws_db_instance.postgres_db.endpoint
  description = "PostgreSQL RDS connection host endpoint"
}

output "redis_endpoint" {
  value       = aws_elasticache_cluster.redis_cache.cache_nodes[0].address
  description = "Redis ElastiCache cluster connection host endpoint"
}
