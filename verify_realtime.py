import asyncio
import json
import redis.asyncio as aioredis

REDIS_URL = "redis://localhost:6379"

async def test_fanout_and_isolation():
    print("Connecting to Redis...")
    redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
    
    # Setup Pub/Sub instances representing subscribers
    pubsub_101_client_A = redis_client.pubsub()
    pubsub_101_client_B = redis_client.pubsub()
    pubsub_102_client_C = redis_client.pubsub()

    # 1. Subscribe
    await pubsub_101_client_A.subscribe("delivery:101")
    await pubsub_101_client_B.subscribe("delivery:101")
    await pubsub_102_client_C.subscribe("delivery:102")
    print("Subscribed Client A and Client B to 'delivery:101'")
    print("Subscribed Client C to 'delivery:102'")

    # Consume initial subscribe confirmation messages
    await pubsub_101_client_A.get_message()
    await pubsub_101_client_B.get_message()
    await pubsub_102_client_C.get_message()

    # 2. Publish to delivery:101
    test_ping = {
        "driver_id": 1,
        "lat": 12.9716,
        "lng": 77.5946,
        "timestamp": "2026-06-09T12:00:00Z"
    }
    print("\nPublishing location update to channel 'delivery:101'...")
    await redis_client.publish("delivery:101", json.dumps(test_ping))

    # 3. Read messages for 101 subscribers
    msg_A = await pubsub_101_client_A.get_message(timeout=1.0)
    msg_B = await pubsub_101_client_B.get_message(timeout=1.0)
    
    print("\n--- Verification: Fan-Out ---")
    if msg_A and msg_B and msg_A["type"] == "message" and msg_B["type"] == "message":
        print("[SUCCESS] Both Client A and Client B received the update simultaneously!")
        print(f"   Client A got: {msg_A['data']}")
        print(f"   Client B got: {msg_B['data']}")
    else:
        print("[FAIL] One or both subscribers did not receive the update.")

    # 4. Read messages for 102 subscriber
    msg_C = await pubsub_102_client_C.get_message(timeout=1.0)
    print("\n--- Verification: Isolation ---")
    
    # We check if we got a location broadcast update message
    if msg_C is None or msg_C["type"] != "message":
        print("[SUCCESS] Client C (subscribed to 102) received 0 updates from channel 101. Channel isolation verified!")
    else:
        print(f"[FAIL] Client C received an unexpected message: {msg_C}")

    # Clean up subscriptions
    await pubsub_101_client_A.unsubscribe()
    await pubsub_101_client_B.unsubscribe()
    await pubsub_102_client_C.unsubscribe()
    await pubsub_101_client_A.aclose()
    await pubsub_101_client_B.aclose()
    await pubsub_102_client_C.aclose()

async def verify_redis_stream():
    redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
    print("\n--- Verification: Redis Streams History ---")
    
    # Read up to 5 events from the stream
    events = await redis_client.xread({"stream:locations": "0-0"}, count=5)
    
    if events:
        print("[SUCCESS] Redis Stream 'stream:locations' contains historical coordinates!")
        for stream_name, event_list in events:
            for event_id, payload in event_list:
                print(f"   Event ID: {event_id} | Driver #{payload.get('driver_id')}: ({payload.get('lat')}, {payload.get('lng')}) at {payload.get('timestamp')}")
    else:
        print("[FAIL] No events found in Redis Stream. Send a GPS ping first to record logs.")

    await redis_client.aclose()

async def main():
    await test_fanout_and_isolation()
    await verify_redis_stream()

if __name__ == "__main__":
    asyncio.run(main())
