import * as THREE from 'three';
import { Player, PlayerUpdate, ModelData, PlayerAnimationData, CharacterData } from '../types';
import { ModelLoader } from '../utils';

export class PlayerManager {
  // Sprite animation state tracking
  private static spriteAnimations = new Map<string, {
    mixer: THREE.AnimationMixer;
    currentFrame: number;
    lastFrameTime: number;
    isMoving: boolean;
    direction: 'fr' | 'bk' | 'lf' | 'rt';
  }>();

  // Sprite mesh references for texture updates
  private static spriteMeshReferences = new Map<string, THREE.Mesh>();

  // Pre-loaded textures for sprite animation
  private static spriteTextures = new Map<string, {
    frame1: THREE.Texture;
    frame2: THREE.Texture;
  }>();

  static generatePlayerColor(playerId: string): string {
    const colors = [
      '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', 
      '#ffeaa7', '#dda0dd', '#98d8c8', '#f7dc6f'
    ];
    const hash = playerId.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return colors[Math.abs(hash) % colors.length];
  }

  /**
   * Create sprite-based player model using character data
   */
  static createSpritePlayerModel(player: Player, isLocalPlayer: boolean = false): { 
    model: THREE.Object3D; 
    mixer?: THREE.AnimationMixer; 
    actions?: { [key: string]: THREE.AnimationAction } 
  } {
    const character = player.character;
    if (!character) {
      throw new Error('Player must have character data for sprite rendering');
    }

    // Create a group to hold the sprite
    const playerGroup = new THREE.Group();
    
    // Create the sprite geometry and material
    const spriteGeometry = new THREE.PlaneGeometry(1, 1.5); // Slightly taller than wide
    
    // Determine initial direction and frame
    const direction = isLocalPlayer ? 'bk' : 'fr'; // Local player shows back, others show front
    const frame = 1;
    
    // Pre-load both frame textures for animation
    const textureLoader = new THREE.TextureLoader();
    const frame1Path = `/assets/sprites/last-guardian-sprites/${character.type}${character.style}_${direction}1.gif`;
    const frame2Path = `/assets/sprites/last-guardian-sprites/${character.type}${character.style}_${direction}2.gif`;
    
    const frame1Texture = textureLoader.load(frame1Path, 
      () => console.log(`✅ Loaded frame 1: ${frame1Path}`),
      undefined,
      (error) => console.error(`❌ Failed to load frame 1: ${frame1Path}`, error)
    );
    
    const frame2Texture = textureLoader.load(frame2Path, 
      () => console.log(`✅ Loaded frame 2: ${frame2Path}`),
      undefined,
      (error) => console.error(`❌ Failed to load frame 2: ${frame2Path}`, error)
    );
    
    // Configure textures
    [frame1Texture, frame2Texture].forEach(texture => {
      texture.magFilter = THREE.NearestFilter; // Pixelated look for retro sprites
      texture.minFilter = THREE.NearestFilter;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
    });
    
    // Store pre-loaded textures
    this.spriteTextures.set(player.id, {
      frame1: frame1Texture,
      frame2: frame2Texture
    });
    
    // Create material with transparency using frame 1 initially
    const spriteMaterial = new THREE.MeshBasicMaterial({
      map: frame1Texture,
      transparent: true,
      alphaTest: 0.1, // Remove pixels with alpha below 0.1
      side: THREE.DoubleSide // Make sprite visible from both sides
    });
    
    // Create the sprite mesh
    const spriteMesh = new THREE.Mesh(spriteGeometry, spriteMaterial);
    spriteMesh.position.set(0, 0.75, 0); // Raise sprite to appear standing on ground
    
    // For other players, make them always face the camera/local player
    if (!isLocalPlayer) {
      spriteMesh.rotation.y = Math.PI; // Face towards camera initially
    }
    
    playerGroup.add(spriteMesh);
    
    // Set player position
    playerGroup.position.set(player.position.x, player.position.y, player.position.z);
    
    // Mark as player object
    playerGroup.userData.isPlayer = true;
    playerGroup.userData.playerId = player.id;
    playerGroup.userData.isLocalPlayer = isLocalPlayer;
    playerGroup.userData.spriteMesh = spriteMesh;
    playerGroup.userData.character = character;
    
    // Initialize sprite animation state
    this.spriteAnimations.set(player.id, {
      mixer: new THREE.AnimationMixer(playerGroup), // Create mixer for consistency
      currentFrame: frame,
      lastFrameTime: Date.now(),
      isMoving: false,
      direction: direction
    });

    // Store sprite mesh reference for texture updates
    this.spriteMeshReferences.set(player.id, spriteMesh);
    
    console.log(`🎮 Created sprite player: ${character.name} (${character.type}${character.style}) for ${isLocalPlayer ? 'local' : 'other'} player`);
    
    return {
      model: playerGroup,
      mixer: this.spriteAnimations.get(player.id)?.mixer,
      actions: {} // No THREE.js actions for sprites, we'll handle animation manually
    };
  }

  static async createPlayerModel(player: Player, isLocalPlayer: boolean = false): Promise<{ 
    model: THREE.Object3D; 
    mixer?: THREE.AnimationMixer; 
    actions?: { [key: string]: THREE.AnimationAction } 
  }> {
    // Use sprite-based rendering if character data is available
    if (player.character) {
      return this.createSpritePlayerModel(player, isLocalPlayer);
    }
    
    // Fallback to 3D model for backwards compatibility
    return this.create3DPlayerModel(player);
  }

  /**
   * Original 3D model creation method (renamed for clarity)
   */
  static async create3DPlayerModel(player: Player): Promise<{ 
    model: THREE.Object3D; 
    mixer?: THREE.AnimationMixer; 
    actions?: { [key: string]: THREE.AnimationAction } 
  }> {
    const modelData = await ModelLoader.loadPlayerModel();
    
    // Use the properly cloned scene directly (loadPlayerModel already uses SkeletonUtils.clone)
    const playerModel = modelData.scene;
    
    // Debug: Log what we're working with for positioning issues
    console.log(`Creating player model for ${player.id}:`, {
      modelBounds: new THREE.Box3().setFromObject(playerModel),
      playerPosition: player.position,
      groundOffset: modelData.groundOffset
    });
    
    // Fix SkinnedMesh coordinate system issues
    this.fixSkinnedMeshes(playerModel, player.id);
    
    // Create animation mixer and actions if animations are available
    const animationResult = this.setupAnimations(playerModel, modelData, player);
    
    // Apply player-specific properties and color
    this.applyPlayerStyling(playerModel, player);
    
    // Set world position and rotation - DON'T apply ground offset for other players
    // Other players' positions come from server and are already correctly positioned
    this.positionPlayer(playerModel, player, undefined);
    
    // Mark as player object to prevent it from being cleared by scenery loading
    playerModel.userData.isPlayer = true;
    playerModel.userData.playerId = player.id;
    
    return animationResult;
  }

  private static fixSkinnedMeshes(playerModel: THREE.Group, playerId: string): void {
    playerModel.traverse((child: THREE.Object3D) => {
      if (child.type === 'Bone' || child.type === 'SkinnedMesh') {
        console.log(`Player ${playerId} - ${child.type}:`, child.name, 'local pos:', child.position.toArray());
        
        // Fix SkinnedMesh coordinate system issues
        if (child.type === 'SkinnedMesh') {
          // Force the SkinnedMesh to respect parent transforms
          child.updateMatrixWorld(true);
          
          // Reset the SkinnedMesh to origin if it's not already there
          if (child.position.x !== 0 || child.position.y !== 0 || child.position.z !== 0) {
            console.log(`Resetting SkinnedMesh position for player ${playerId}`);
            child.position.set(0, 0, 0);
          }
          
          // Ensure the SkinnedMesh doesn't have its own transform that conflicts
          child.matrixAutoUpdate = true;
          
          // Additional fix: ensure the skeleton respects the parent transform
          const skinnedMesh = child as THREE.SkinnedMesh;
          if (skinnedMesh.skeleton) {
            // Force skeleton to update relative to parent
            skinnedMesh.skeleton.update();
            console.log(`Updated skeleton for player ${playerId}`);
          }
          
          console.log(`Fixed SkinnedMesh for player ${playerId}`);
        }
      }
    });
  }

  private static setupAnimations(
    playerModel: THREE.Group, 
    modelData: ModelData, 
    player: Player
  ): { model: THREE.Object3D; mixer?: THREE.AnimationMixer; actions?: { [key: string]: THREE.AnimationAction } } {
    let mixer: THREE.AnimationMixer | undefined;
    let actions: { [key: string]: THREE.AnimationAction } = {};
    
    if (modelData.animations.length > 0) {
      mixer = new THREE.AnimationMixer(playerModel);
      
      // Create actions for each animation
      modelData.animations.forEach((clip) => {
        const action = mixer!.clipAction(clip);
        actions[clip.name] = action;
        
        // Set default properties for walk animation
        if (clip.name === 'StickMan_Run') {
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.clampWhenFinished = true;
          action.weight = 1.0;
          // Initialize based on player's current movement state
          action.reset();
          action.play();
          action.paused = !player.isMoving;
          action.enabled = true;
          
          // Set initial animation direction if player is moving
          if (player.isMoving) {
            action.timeScale = player.movementDirection === 'backward' ? -300 : 300; // Speed up by factor of 300
          } else {
            action.timeScale = 300; // Default speed when not moving but ready
          }
        }
      });
      
      console.log('Created animation actions for player:', Object.keys(actions));
    }

    return { model: playerModel, mixer, actions };
  }

  private static applyPlayerStyling(playerModel: THREE.Group, player: Player): void {
    playerModel.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        // Clone material to avoid sharing between players
        if (Array.isArray(child.material)) {
          child.material = child.material.map(mat => {
            const clonedMat = mat.clone();
            clonedMat.color.setHex(parseInt(player.color.replace('#', '0x')));
            return clonedMat;
          });
        } else {
          const clonedMaterial = child.material.clone();
          clonedMaterial.color.setHex(parseInt(player.color.replace('#', '0x')));
          child.material = clonedMaterial;
        }
      }
    });
  }

  private static positionPlayer(playerModel: THREE.Group, player: Player, groundOffset?: { x: number; y: number; z: number }): void {
    console.log(`Setting player ${player.id} position to:`, player.position);
    
    // Apply ground offset if provided, otherwise use player position directly
    if (groundOffset) {
      playerModel.position.set(
        player.position.x + groundOffset.x,
        player.position.y + groundOffset.y,
        player.position.z + groundOffset.z
      );
    } else {
      playerModel.position.set(
        player.position.x,
        player.position.y,
        player.position.z
      );
    }
    
    // Set only Y rotation with Math.PI offset to account for model's built-in rotation
    playerModel.rotation.set(
      0, // Keep character upright
      player.rotation.y + Math.PI,
      0  // Keep character upright
    );
    playerModel.castShadow = true;
    
    // Force update transforms and verify final positions
    playerModel.updateMatrixWorld(true);
    
    // Debug: Check final world positions after all transforms
    this.debugWorldPosition(playerModel, player);
  }

  private static debugWorldPosition(playerModel: THREE.Group, player: Player): void {
    playerModel.traverse((child: THREE.Object3D) => {
      if (child.type === 'SkinnedMesh') {
        const worldPos = child.getWorldPosition(new THREE.Vector3());
        console.log(`Final world position for player ${player.id} SkinnedMesh:`, worldPos.toArray());
        console.log(`Expected position:`, [player.position.x, player.position.y, player.position.z]);
        
        // If world position is still wrong, this indicates a deeper issue
        if (Math.abs(worldPos.x - player.position.x) > 0.1 || 
            Math.abs(worldPos.z - player.position.z) > 0.1) {
          console.warn(`⚠️  Player ${player.id} SkinnedMesh world position mismatch!`);
        }
      }
    });
  }

  static updatePlayerAnimation(
    playerId: string, 
    playerData: PlayerUpdate, 
    playersAnimations: Map<string, PlayerAnimationData>
  ): void {
    const animData = playersAnimations.get(playerId);
    if (animData && animData.actions.StickMan_Run) {
      const walkAction = animData.actions.StickMan_Run;
      
      // Use the RECEIVED playerData.isMoving directly
      if (playerData.isMoving) {
        if (!walkAction.isRunning()) {
          walkAction.play();
        }
        walkAction.paused = false;
        walkAction.enabled = true;
        
        // Set animation direction based on movement with 300x speed
        if (playerData.movementDirection === 'backward') {
          walkAction.timeScale = -300; // Speed up by factor of 300
        } else {
          walkAction.timeScale = 300; // Speed up by factor of 300
        }
      } else {
        // Pause instead of stop to maintain smooth transitions
        walkAction.paused = true;
      }
    }
  }

  /**
   * Update sprite animation for a player
   */
  static updateSpriteAnimation(playerId: string, isMoving: boolean): void {
    const animData = this.spriteAnimations.get(playerId);
    if (!animData) {
      console.log(`❌ No animation data found for player: ${playerId}`);
      return;
    }

    const now = Date.now();
    const FRAME_DURATION = 500; // ms per frame (slower than UI preview)

    // Update moving state
    animData.isMoving = isMoving;

    console.log(`🎬 Sprite animation update - Player: ${playerId}, Moving: ${isMoving}, Current Frame: ${animData.currentFrame}, Last Frame Time: ${now - animData.lastFrameTime}ms ago`);

    // Only animate frames if moving
    if (isMoving && (now - animData.lastFrameTime) > FRAME_DURATION) {
      // Toggle between frame 1 and 2
      const oldFrame = animData.currentFrame;
      animData.currentFrame = animData.currentFrame === 1 ? 2 : 1;
      animData.lastFrameTime = now;

      console.log(`🔄 Frame change - Player: ${playerId}, ${oldFrame} → ${animData.currentFrame}`);

      // Update the sprite texture
      this.updateSpriteTexture(playerId);
    } else if (!isMoving) {
      // Reset to frame 1 when not moving
      if (animData.currentFrame !== 1) {
        console.log(`⏹️ Resetting to frame 1 - Player: ${playerId}`);
        animData.currentFrame = 1;
        this.updateSpriteTexture(playerId);
      }
    }
  }

  /**
   * Update the texture of a sprite player
   */
  private static updateSpriteTexture(playerId: string): void {
    const animData = this.spriteAnimations.get(playerId);
    if (!animData) {
      console.log(`❌ No animation data for texture update: ${playerId}`);
      return;
    }

    // Find the sprite mesh reference
    const spriteMeshRef = this.spriteMeshReferences.get(playerId);
    if (!spriteMeshRef) {
      console.log(`❌ No sprite mesh reference found: ${playerId}`);
      return;
    }

    // Get pre-loaded textures
    const textures = this.spriteTextures.get(playerId);
    if (!textures) {
      console.log(`❌ No pre-loaded textures found: ${playerId}`);
      return;
    }

    // Get the material
    const material = spriteMeshRef.material as THREE.MeshBasicMaterial;
    
    // Switch to the appropriate frame texture
    const newTexture = animData.currentFrame === 1 ? textures.frame1 : textures.frame2;
    
    console.log(`🔄 Switching to frame ${animData.currentFrame} for player: ${playerId}`);
    
    // Apply new texture (no loading needed since it's pre-loaded)
    material.map = newTexture;
    material.needsUpdate = true;
    
    console.log(`✅ Texture switched successfully to frame ${animData.currentFrame}`);
  }

  /**
   * Make other player sprites face the local player
   */
  static updateOtherPlayerFacing(otherPlayerId: string, localPlayerPosition: THREE.Vector3): void {
    const spriteMeshRef = this.spriteMeshReferences.get(otherPlayerId);
    if (!spriteMeshRef) return;

    // Get the player group (parent of sprite mesh)
    const playerGroup = spriteMeshRef.parent;
    if (!playerGroup) return;

    // Calculate direction from other player to local player
    const otherPlayerPosition = playerGroup.position;
    const direction = new THREE.Vector3()
      .subVectors(localPlayerPosition, otherPlayerPosition)
      .normalize();

    // Calculate angle and make sprite face the local player
    const angle = Math.atan2(direction.x, direction.z);
    spriteMeshRef.rotation.y = angle;
  }

  /**
   * Update all other players to face the local player
   */
  static updateAllOtherPlayersFacing(localPlayerPosition: THREE.Vector3): void {
    this.spriteMeshReferences.forEach((spriteMesh, playerId) => {
      // Skip if this is the local player
      if (spriteMesh.parent && !spriteMesh.parent.userData.isLocalPlayer) {
        this.updateOtherPlayerFacing(playerId, localPlayerPosition);
      }
    });
  }
  static updateSpritePlayerPosition(player: Player, playerData: PlayerUpdate): void {
    // Update basic position data
    player.position = playerData.position;
    if (playerData.rotation) {
      player.rotation = playerData.rotation;
    }
    
    // Update movement state for animation
    player.isMoving = playerData.isMoving;
    player.movementDirection = playerData.movementDirection;
    
    if (player.mesh) {
      // Update position
      player.mesh.position.set(
        playerData.position.x,
        playerData.position.y,
        playerData.position.z
      );

      // Update sprite animation if this is a sprite-based player
      if (player.mesh.userData.spriteMesh) {
        this.updateSpriteAnimation(player.id, playerData.isMoving || false);
      }
      
      // Force a render update
      if (player.mesh.parent) {
        player.mesh.updateMatrixWorld(true);
      }
    }
  }

  static updatePlayerPosition(player: Player, playerData: PlayerUpdate): void {
    // Check if this is a sprite-based player
    if (player.mesh && player.mesh.userData.spriteMesh) {
      this.updateSpritePlayerPosition(player, playerData);
      return;
    }
    
    // Handle 3D model players (original implementation)
    player.position = playerData.position;
    if (playerData.rotation) {
      player.rotation = playerData.rotation;
    }
    
    // Update movement state for animation
    player.isMoving = playerData.isMoving;
    player.movementDirection = playerData.movementDirection;
    
    if (player.mesh) {
      player.mesh.position.set(
        playerData.position.x,
        playerData.position.y,
        playerData.position.z
      );
      if (playerData.rotation) {
        // Apply only Y rotation with Math.PI offset
        player.mesh.rotation.set(
          0,
          playerData.rotation.y + Math.PI,
          0
        );
      }
      
      // Force a render update
      if (player.mesh.parent) {
        player.mesh.updateMatrixWorld(true);
      }
    }
  }

  static disposePlayerMesh(mesh: THREE.Object3D): void {
    // Clean up sprite references if this is a sprite player
    if (mesh.userData.playerId) {
      const playerId = mesh.userData.playerId;
      
      // Clean up pre-loaded textures
      const textures = this.spriteTextures.get(playerId);
      if (textures) {
        textures.frame1.dispose();
        textures.frame2.dispose();
        this.spriteTextures.delete(playerId);
      }
      
      // Clean up other references
      this.spriteMeshReferences.delete(playerId);
      this.spriteAnimations.delete(playerId);
    }

    if (mesh instanceof THREE.Mesh) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    } else if (mesh instanceof THREE.Group) {
      // Dispose of all meshes in the group
      mesh.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose());
          } else {
            (child.material as THREE.Material).dispose();
          }
        }
      });
    }
  }
}
