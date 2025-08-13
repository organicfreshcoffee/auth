import * as THREE from 'three';
import { CubeConfig } from '../config/cubeConfig';
import { TextureManager, CubeType } from '../utils/textureManager';

export interface CubeFloorOptions {
  cubeSize?: number;
  floorColor?: number;
  yOffset?: number;
}

export interface CubePosition {
  x: number;
  y: number;
}

export interface CubeInfo {
  position: CubePosition;
  color: number;
  type: 'room' | 'hallway' | 'overlap';
}

/**
 * Cube floor renderer with overlap detection and color coding
 */
export class CubeFloorRenderer {
  private static cubeRegistry = new Map<string, CubeInfo>();
  private static sceneGroups = new Map<THREE.Scene, THREE.Group>();
  private static excludedCoordinates = new Set<string>();

  private static getCubeKey(x: number, y: number): string {
    return `${x},${y}`;
  }

  /**
   * Clear all registered cubes for a fresh start
   */
  static clearRegistry(): void {
    console.log(`🧹 CubeFloorRenderer.clearRegistry() called - clearing ${this.cubeRegistry.size} cubes and ${this.excludedCoordinates.size} exclusions`);
    console.log(`🧹 Call stack:`, new Error().stack);
    this.cubeRegistry.clear();
    this.excludedCoordinates.clear();
  }

  /**
   * Set coordinates to exclude from rendering (e.g., for downward stairs)
   */
  static setExcludedCoordinates(coordinates: CubePosition[]): void {
    console.log(`🚫 setExcludedCoordinates called with ${coordinates.length} coordinates:`, coordinates);
    this.excludedCoordinates.clear();
    coordinates.forEach(coord => {
      const key = this.getCubeKey(coord.x, coord.y);
      this.excludedCoordinates.add(key);
      console.log(`🚫 Adding exclusion for coordinate (${coord.x}, ${coord.y}) -> key: "${key}"`);
      
      // Check if this coordinate is already registered
      const existing = this.cubeRegistry.get(key);
      if (existing) {
        console.log(`⚠️ Coordinate (${coord.x}, ${coord.y}) is already registered as ${existing.type} - will be excluded during rendering`);
      } else {
        console.log(`✅ Coordinate (${coord.x}, ${coord.y}) not yet registered - good!`);
      }
    });
    console.log(`🚫 Set ${coordinates.length} coordinates to exclude from floor rendering`);
    console.log(`🚫 Excluded coordinate keys:`, Array.from(this.excludedCoordinates));
    console.log(`🚫 Current excludedCoordinates size after setting: ${this.excludedCoordinates.size}`);
  }

  /**
   * Unregister specific coordinates from the cube registry
   */
  static unregisterCoordinates(coordinates: CubePosition[]): void {
    coordinates.forEach(coord => {
      const key = this.getCubeKey(coord.x, coord.y);
      const removed = this.cubeRegistry.delete(key);
      if (removed) {
        console.log(`🗑️ Unregistered cube at coordinate (${coord.x}, ${coord.y})`);
      } else {
        console.log(`ℹ️ No cube registered at coordinate (${coord.x}, ${coord.y}) to unregister`);
      }
    });
  }

  /**
   * Get all registered cube coordinates
   */
  static getAllCoordinates(): CubePosition[] {
    const coordinates: CubePosition[] = [];
    this.cubeRegistry.forEach((cubeInfo) => {
      coordinates.push(cubeInfo.position);
    });
    return coordinates;
  }

  /**
   * Register cubes for a specific type and color
   */
  static registerCubes(
    coordinates: CubePosition[],
    color: number,
    type: 'room' | 'hallway'
  ): void {
    console.log(`📝 registerCubes called for ${type} with ${coordinates.length} coordinates. Current exclusions: ${this.excludedCoordinates.size}`);
    
    coordinates.forEach(coord => {
      const key = this.getCubeKey(coord.x, coord.y);
      
      // Check if this coordinate is excluded (e.g., for downward stairs)
      if (this.excludedCoordinates.has(key)) {
        console.log(`🚫 Skipping registration of excluded coordinate (${coord.x}, ${coord.y}) for ${type}`);
        return;
      }
      
      const existing = this.cubeRegistry.get(key);
      
      if (existing) {
        // Mark as overlap and set purple color
        this.cubeRegistry.set(key, {
          position: coord,
          color: 0x800080, // Purple for overlaps
          type: 'overlap'
        });
        console.log(`🟣 Overlap detected at (${coord.x}, ${coord.y})`);
      } else {
        // First time registration
        this.cubeRegistry.set(key, {
          position: coord,
          color,
          type
        });
      }
    });
  }

  /**
   * Render all registered cubes with proper textures
   */
  static renderAllCubes(
    scene: THREE.Scene,
    options: CubeFloorOptions = {}
  ): THREE.Group {
    const {
      cubeSize = CubeConfig.getCubeSize(),
      yOffset = 0
    } = options;

    // Create or get existing group for this scene
    let sceneGroup = this.sceneGroups.get(scene);
    if (!sceneGroup) {
      sceneGroup = new THREE.Group();
      sceneGroup.name = 'AllFloorCubes';
      this.sceneGroups.set(scene, sceneGroup);
      scene.add(sceneGroup);
    }

    // Clear existing cubes
    sceneGroup.clear();

    // Create geometry once for all cubes
    const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);

    // Count types for reporting
    let roomCount = 0;
    let hallwayCount = 0;
    let overlapCount = 0;

    // Render all registered cubes
    this.cubeRegistry.forEach((cubeInfo, key) => {
      // Skip excluded coordinates
      if (this.excludedCoordinates.has(key)) {
        console.log(`🚫 Skipping excluded cube at (${cubeInfo.position.x}, ${cubeInfo.position.y})`);
        return;
      }

      // Determine the cube type for texturing
      let cubeType: CubeType;
      let material: THREE.MeshLambertMaterial;

      if (cubeInfo.type === 'overlap') {
        // Use hallway floor texture for overlaps
        cubeType = 'hallway-floor';
        material = TextureManager.createMaterialWithTexture(cubeType);
        overlapCount++;
      } else if (cubeInfo.type === 'hallway') {
        cubeType = 'hallway-floor';
        material = TextureManager.createMaterialWithTexture(cubeType);
        hallwayCount++;
      } else { // room
        cubeType = 'room-floor';
        material = TextureManager.createMaterialWithTexture(cubeType);
        roomCount++;
      }

      // Create cube mesh
      const cube = new THREE.Mesh(geometry, material);
      const cubeWorldX = cubeInfo.position.x * cubeSize;
      const cubeWorldZ = cubeInfo.position.y * cubeSize;
      cube.position.set(
        cubeWorldX,
        yOffset + cubeSize / 2,
        cubeWorldZ
      );
      
      // Debug logging for cube positioning
      if (cubeInfo.position.x === 9 && cubeInfo.position.y === 2) {
        console.log(`[cube] 🟫 Floor cube at grid (${cubeInfo.position.x}, ${cubeInfo.position.y}) positioned at world (${cubeWorldX}, ${cubeWorldZ})`);
        console.log(`[cube] 🟫 Floor cube center is at: (${cubeWorldX + cubeSize/2}, ${cubeWorldZ + cubeSize/2})`);
      }
      
      cube.name = `FloorCube_${cubeInfo.type}_${cubeInfo.position.x}_${cubeInfo.position.y}`;
      cube.castShadow = true;
      cube.receiveShadow = true;

      sceneGroup.add(cube);
    });

    console.log(`🎨 Rendered floor cubes with textures: ${roomCount} rooms, ${hallwayCount} hallways, ${overlapCount} overlaps`);
    
    return sceneGroup;
  }

  /**
   * Get coordinates for a rectangular area
   */
  static getAreaCoordinates(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): CubePosition[] {
    const coordinates: CubePosition[] = [];
    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        coordinates.push({ x, y });
      }
    }
    return coordinates;
  }

  /**
   * Generate coordinates along a path between two points
   */
  static getPathCoordinates(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    width: number = 1
  ): CubePosition[] {
    const coordinates: CubePosition[] = [];
    
    // Calculate direction and length
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) {
      // Single point
      coordinates.push({ x: Math.round(startX), y: Math.round(startY) });
      return coordinates;
    }
    
    // Normalize direction
    const dirX = dx / length;
    const dirY = dy / length;
    
    // Calculate perpendicular for width
    const perpX = -dirY;
    const perpY = dirX;
    
    // Number of steps along the path
    const steps = Math.ceil(length) + 1;
    
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const centerX = startX + dirX * length * t;
      const centerY = startY + dirY * length * t;
      
      // Add cubes for width
      for (let w = 0; w < width; w++) {
        const widthOffset = w - Math.floor(width / 2);
        const finalX = Math.round(centerX + perpX * widthOffset);
        const finalY = Math.round(centerY + perpY * widthOffset);
        
        coordinates.push({ x: finalX, y: finalY });
      }
    }
    
    // Remove duplicates
    const uniqueCoords = coordinates.filter((coord, index, arr) => 
      arr.findIndex(c => c.x === coord.x && c.y === coord.y) === index
    );
    
    return uniqueCoords;
  }

  /**
   * Clean up resources
   */
  static dispose(): void {
    this.cubeRegistry.clear();
    this.excludedCoordinates.clear();
    this.sceneGroups.forEach((group, scene) => {
      scene.remove(group);
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(material => material.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
    });
    this.sceneGroups.clear();
  }
}
