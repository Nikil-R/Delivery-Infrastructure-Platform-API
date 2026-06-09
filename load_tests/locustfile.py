import random
from locust import HttpUser, task, between

class DeliveryPlatformUser(HttpUser):
    # Simulated delay between operations (1 to 3 seconds)
    wait_time = between(1, 3)

    def on_start(self):
        """Setup authentication key and client configurations."""
        self.api_key = "dep_kC73DQSHTlqbWiINIDLN04pzJe_Ar7Malig6o1jU4zI"
        self.headers = {"X-API-Key": self.api_key}
        
        # Keep track of created deliveries to simulate customer and driver events
        self.created_order_ids = []
        
        # Register a mock driver session for this virtual user thread
        self.driver_id = random.randint(1, 3) # Seed logs Driver 1, 2, 3

    @task(3)
    def create_delivery_flow(self):
        """Simulate a merchant client creating a delivery order."""
        payload = {
            "pickup_lat": round(random.uniform(12.90, 12.99), 4),
            "pickup_lng": round(random.uniform(77.50, 77.65), 4),
            "dropoff_lat": round(random.uniform(12.90, 12.99), 4),
            "dropoff_lng": round(random.uniform(77.50, 77.65), 4)
        }
        with self.client.post("/deliveries", json=payload, headers=self.headers, name="/deliveries [Create]") as response:
            if response.status_code == 201:
                order_data = response.json()
                self.created_order_ids.append(order_data["id"])

    @task(10)
    def driver_telemetry_flow(self):
        """Simulate active courier GPS location update heartbeat ping."""
        payload = {
            "latitude": round(random.uniform(12.90, 12.99), 4),
            "longitude": round(random.uniform(77.50, 77.65), 4)
        }
        self.client.post(
            f"/drivers/{self.driver_id}/location",
            json=payload,
            name="/drivers/{id}/location"
        )

    @task(5)
    def customer_tracking_flow(self):
        """Simulate customers polling the tracking status of active orders."""
        if not self.created_order_ids:
            return
            
        target_id = random.choice(self.created_order_ids)
        self.client.get(
            f"/deliveries/{target_id}",
            headers=self.headers,
            name="/deliveries/{id} [Get]"
        )

    @task(2)
    def query_vitals_observability(self):
        """Simulate admin operations dashboard polling vitals statistics."""
        self.client.get(
            "/analytics/observability/vitals",
            headers=self.headers,
            name="/analytics/observability/vitals"
        )
