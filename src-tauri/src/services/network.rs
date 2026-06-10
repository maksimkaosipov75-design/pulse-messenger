use async_trait::async_trait;
use futures::{AsyncReadExt, AsyncWriteExt, StreamExt};
use libp2p::{
    identify, identity, mdns, noise, ping,
    request_response::{self, Codec, Message, ProtocolSupport},
    swarm::SwarmEvent,
    tcp, yamux, Multiaddr, PeerId,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;

use super::protocol;

// === Request-Response Codec ===

#[derive(Debug, Clone, Default)]
pub struct PulseCodec;

#[derive(Debug, Clone)]
pub struct PulseProtocol();

impl AsRef<str> for PulseProtocol {
    fn as_ref(&self) -> &str {
        "/pulse/msg/1.0.0"
    }
}

#[async_trait]
impl Codec for PulseCodec {
    type Protocol = PulseProtocol;
    type Request = Vec<u8>;
    type Response = Vec<u8>;

    async fn read_request<T>(&mut self, _: &Self::Protocol, io: &mut T) -> io::Result<Self::Request>
    where
        T: AsyncReadExt + Unpin + Send,
    {
        let mut buf = Vec::new();
        io.read_to_end(&mut buf).await?;
        Ok(buf)
    }

    async fn read_response<T>(
        &mut self,
        _: &Self::Protocol,
        io: &mut T,
    ) -> io::Result<Self::Response>
    where
        T: AsyncReadExt + Unpin + Send,
    {
        let mut buf = Vec::new();
        io.read_to_end(&mut buf).await?;
        Ok(buf)
    }

    async fn write_request<T>(
        &mut self,
        _: &Self::Protocol,
        io: &mut T,
        req: Self::Request,
    ) -> io::Result<()>
    where
        T: AsyncWriteExt + Unpin + Send,
    {
        io.write_all(&req).await?;
        io.close().await?;
        Ok(())
    }

    async fn write_response<T>(
        &mut self,
        _: &Self::Protocol,
        io: &mut T,
        resp: Self::Response,
    ) -> io::Result<()>
    where
        T: AsyncWriteExt + Unpin + Send,
    {
        io.write_all(&resp).await?;
        io.close().await?;
        Ok(())
    }
}

// === Behaviour ===

#[derive(libp2p::swarm::NetworkBehaviour)]
pub struct PulseBehaviour {
    pub mdns: mdns::tokio::Behaviour,
    pub identify: identify::Behaviour,
    pub ping: ping::Behaviour,
    pub request_response: request_response::Behaviour<PulseCodec>,
}

// === Events ===

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NetworkEvent {
    PeerConnected {
        peer_id: String,
        multiaddr: String,
    },
    PeerDisconnected {
        peer_id: String,
    },
    MessageReceived {
        from_peer: String,
        data: Vec<u8>,
    },
    MessageDelivered {
        peer_id: String,
        message_id: String,
    },
    SendFailed {
        peer_id: String,
        message_id: Option<String>,
        error: String,
    },
    ListenAddress {
        address: String,
    },
    NetworkError {
        error: String,
    },
}

// === Commands ===

pub enum NetworkCommand {
    SendMessage {
        peer_id: PeerId,
        data: Vec<u8>,
        /// App-level message ID for delivery tracking
        message_id: Option<String>,
    },
    AddPeer {
        addr: Multiaddr,
    },
    Stop,
}

// === Network Service ===
// Shared state between the service and the spawned task via Arcs.

pub struct NetworkService {
    peers: Arc<Mutex<HashSet<PeerId>>>,
    is_running: Arc<Mutex<bool>>,
    local_peer_id: Arc<Mutex<String>>,
}

impl NetworkService {
    pub fn new() -> Self {
        Self {
            peers: Arc::new(Mutex::new(HashSet::new())),
            is_running: Arc::new(Mutex::new(false)),
            local_peer_id: Arc::new(Mutex::new(String::new())),
        }
    }

    pub fn get_peer_id(&self) -> String {
        self.local_peer_id
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    pub fn get_peers(&self) -> Vec<String> {
        self.peers
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .iter()
            .map(|p| p.to_string())
            .collect()
    }

    pub fn is_running(&self) -> bool {
        *self.is_running.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Clone the shared state Arcs for use with the `start_network` free function.
    pub fn clone_state(&self) -> SharedNetworkState {
        (
            self.peers.clone(),
            self.is_running.clone(),
            self.local_peer_id.clone(),
        )
    }
}

/// Shared handles to the live network state: (peers, is_running, local_peer_id)
pub type SharedNetworkState = (
    Arc<Mutex<HashSet<PeerId>>>,
    Arc<Mutex<bool>>,
    Arc<Mutex<String>>,
);

/// Start the P2P network. Uses shared Arc state so that the service
/// reflects the actual network state after start.
pub async fn start_network(
    peers: Arc<Mutex<HashSet<PeerId>>>,
    is_running: Arc<Mutex<bool>>,
    local_peer_id: Arc<Mutex<String>>,
    listen_addr: Option<&str>,
    keypair: Option<identity::Keypair>,
) -> Result<
    (
        mpsc::UnboundedSender<NetworkCommand>,
        mpsc::UnboundedReceiver<NetworkEvent>,
    ),
    String,
> {
    let (event_tx, event_rx) = mpsc::unbounded_channel();
    let (command_tx, command_rx) = mpsc::unbounded_channel();

    // A persisted keypair keeps the PeerId stable across restarts so
    // contact codes don't go stale
    let local_key = keypair.unwrap_or_else(identity::Keypair::generate_ed25519);
    let actual_peer_id = PeerId::from(local_key.public());

    // Update shared peer ID
    {
        let mut pid = local_peer_id.lock().unwrap_or_else(|e| e.into_inner());
        *pid = actual_peer_id.to_string();
    }

    let mut swarm = libp2p::SwarmBuilder::with_existing_identity(local_key)
        .with_tokio()
        .with_tcp(
            tcp::Config::default(),
            noise::Config::new,
            yamux::Config::default,
        )
        .map_err(|e| e.to_string())?
        .with_behaviour(|key| {
            let mdns =
                mdns::tokio::Behaviour::new(mdns::Config::default(), key.public().to_peer_id())?;
            let identify = identify::Behaviour::new(identify::Config::new(
                "/pulse/1.0.0".to_string(),
                key.public(),
            ));
            let ping = ping::Behaviour::new(ping::Config::new());
            let request_response = request_response::Behaviour::<PulseCodec>::new(
                [(PulseProtocol(), ProtocolSupport::Full)],
                request_response::Config::default(),
            );

            Ok(PulseBehaviour {
                mdns,
                identify,
                ping,
                request_response,
            })
        })
        .map_err(|e| format!("{:?}", e))?
        .with_swarm_config(|cfg| cfg.with_idle_connection_timeout(Duration::from_secs(60)))
        .build();

    let addr: Multiaddr = listen_addr
        .unwrap_or("/ip4/0.0.0.0/tcp/0")
        .parse()
        .map_err(|e: libp2p::multiaddr::Error| format!("Invalid multiaddr: {}", e))?;

    swarm.listen_on(addr).map_err(|e| e.to_string())?;

    // Mark as running
    *is_running.lock().unwrap_or_else(|e| e.into_inner()) = true;

    let evt_tx = event_tx.clone();

    tokio::spawn(async move {
        let mut command_rx = command_rx;
        // OutboundRequestId -> app message id, for delivery acks/failures
        let mut in_flight: std::collections::HashMap<
            request_response::OutboundRequestId,
            Option<String>,
        > = std::collections::HashMap::new();
        loop {
            tokio::select! {
                event = swarm.next() => {
                    if let Some(event) = event {
                        handle_event(event, &mut swarm, &peers, &evt_tx, &mut in_flight);
                    }
                }
                cmd = command_rx.recv() => {
                    match cmd {
                        Some(NetworkCommand::SendMessage { peer_id, data, message_id }) => {
                            log::info!("Sending message to {}: {} bytes", peer_id, data.len());
                            let req_id = swarm.behaviour_mut().request_response.send_request(&peer_id, data);
                            in_flight.insert(req_id, message_id);
                        }
                        Some(NetworkCommand::AddPeer { addr }) => {
                            log::info!("Dialing {}", addr);
                            if let Err(e) = swarm.dial(addr.clone()) {
                                log::error!("Failed to dial {}: {}", addr, e);
                            }
                        }
                        Some(NetworkCommand::Stop) => {
                            log::info!("Stopping network");
                            break;
                        }
                        None => break,
                    }
                }
            }
        }
        *is_running.lock().unwrap_or_else(|e| e.into_inner()) = false;
    });

    Ok((command_tx, event_rx))
}

fn handle_event(
    event: SwarmEvent<PulseBehaviourEvent>,
    swarm: &mut libp2p::Swarm<PulseBehaviour>,
    peers: &Arc<Mutex<HashSet<PeerId>>>,
    evt_tx: &mpsc::UnboundedSender<NetworkEvent>,
    in_flight: &mut std::collections::HashMap<request_response::OutboundRequestId, Option<String>>,
) {
    match event {
        SwarmEvent::NewListenAddr { address, .. } => {
            log::info!("Listening on {}", address);
            let _ = evt_tx.send(NetworkEvent::ListenAddress {
                address: address.to_string(),
            });
        }
        SwarmEvent::Behaviour(PulseBehaviourEvent::Mdns(mdns::Event::Discovered(list))) => {
            for (peer_id, multiaddr) in list {
                log::info!("Discovered peer: {} at {}", peer_id, multiaddr);
                peers
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .insert(peer_id);
                swarm.add_peer_address(peer_id, multiaddr.clone());
                let _ = evt_tx.send(NetworkEvent::PeerConnected {
                    peer_id: peer_id.to_string(),
                    multiaddr: multiaddr.to_string(),
                });
            }
        }
        SwarmEvent::Behaviour(PulseBehaviourEvent::Mdns(mdns::Event::Expired(list))) => {
            for (peer_id, _) in list {
                log::info!("Peer expired: {}", peer_id);
                peers
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .remove(&peer_id);
                let _ = evt_tx.send(NetworkEvent::PeerDisconnected {
                    peer_id: peer_id.to_string(),
                });
            }
        }
        SwarmEvent::Behaviour(PulseBehaviourEvent::RequestResponse(
            request_response::Event::Message {
                peer,
                message:
                    Message::Request {
                        request, channel, ..
                    },
                ..
            },
        )) => {
            log::info!("Received message from {}: {} bytes", peer, request.len());

            match protocol::decode_message(&request) {
                Ok(_msg) => {
                    log::info!("Decoded protocol message from {}", peer);
                    let _ = evt_tx.send(NetworkEvent::MessageReceived {
                        from_peer: peer.to_string(),
                        data: request,
                    });
                }
                Err(e) => {
                    log::error!("Failed to decode message from {}: {}", peer, e);
                }
            }

            // Send ACK
            let _ = swarm
                .behaviour_mut()
                .request_response
                .send_response(channel, b"OK".to_vec());
        }
        SwarmEvent::Behaviour(PulseBehaviourEvent::RequestResponse(
            request_response::Event::Message {
                peer,
                message:
                    Message::Response {
                        request_id,
                        response,
                    },
                ..
            },
        )) => {
            log::info!("ACK from {}: {}", peer, String::from_utf8_lossy(&response));
            if let Some(Some(message_id)) = in_flight.remove(&request_id) {
                let _ = evt_tx.send(NetworkEvent::MessageDelivered {
                    peer_id: peer.to_string(),
                    message_id,
                });
            }
        }
        SwarmEvent::Behaviour(PulseBehaviourEvent::RequestResponse(
            request_response::Event::OutboundFailure {
                peer,
                request_id,
                error,
                ..
            },
        )) => {
            log::error!("Send failed to {}: {:?}", peer, error);
            let message_id = in_flight.remove(&request_id).flatten();
            let _ = evt_tx.send(NetworkEvent::SendFailed {
                peer_id: peer.to_string(),
                message_id,
                error: format!("{:?}", error),
            });
        }
        SwarmEvent::Behaviour(PulseBehaviourEvent::Identify(identify::Event::Received {
            peer_id,
            info,
            ..
        })) => {
            log::info!("Identified peer {}: {:?}", peer_id, info.protocol_version);
            for addr in info.listen_addrs {
                swarm.add_peer_address(peer_id, addr);
            }
        }
        SwarmEvent::Behaviour(PulseBehaviourEvent::Ping(ping::Event {
            peer,
            result: Ok(rtt),
            ..
        })) => {
            log::debug!("Ping to {} took {:?}", peer, rtt);
        }
        SwarmEvent::ConnectionEstablished { peer_id, .. } => {
            peers
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .insert(peer_id);
            let _ = evt_tx.send(NetworkEvent::PeerConnected {
                peer_id: peer_id.to_string(),
                multiaddr: String::new(),
            });
        }
        SwarmEvent::ConnectionClosed { peer_id, .. } => {
            peers
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&peer_id);
            let _ = evt_tx.send(NetworkEvent::PeerDisconnected {
                peer_id: peer_id.to_string(),
            });
        }
        _ => {}
    }
}
