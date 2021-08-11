import { EntityManager } from './util/EntityManager';
import { FactoryMap } from './util/FactoryMap';
import { EntityType } from './entity/Entity';
import { MoveManager } from './util/MoveManager';
import { readTurnInput, readInitialInput } from './util/inputReaders';
import { Factory } from './entity/Factory';
import { Troop } from './entity/Troop';

/** HANDLE INPUT */
const {
    factoryCount,
    links
} = readInitialInput();

const map = new FactoryMap(factoryCount, links);
const entities = new EntityManager();
const moves = new MoveManager();

/** GAME LOOP */
while (true) {
    const {
        entityLines,
    } = readTurnInput();

    entities.clearEntities();
    entityLines.forEach(({entityId, entityType, arg1, arg2, arg3, arg4, arg5}) => {
        entities.addEntity(entityType, entityId, arg1, arg2, arg3, arg4, arg5);
    });
    
    // Move logic

    // 1. If there are any incoming troops, decrease our factories available cyborgs by the troop size
    const enemyTroops = <Troop[]>entities.getEnemy(EntityType.TROOP);
    const factories = <Factory[]>entities.getEntities(EntityType.FACTORY);
    
    enemyTroops.forEach((troop) => {
        const targetFactory = factories[troop.targetId];

        if (!targetFactory.isFriendly()) return false;
        // Calculate how many cyborgs will be generated by the troops arrival
        const generatedCyborgs = targetFactory.generatedAfterTurns(troop.remainingTurns);

        if (generatedCyborgs < troop.numCyborgs) {
            // If we will not generate enough troops in time, reserve the necessary number of available troops
            const requiredTroops = troop.numCyborgs - generatedCyborgs;
            targetFactory.numCyborgs -= requiredTroops;
            if (targetFactory.numCyborgs < 0) {
                targetFactory.numCyborgs = 0;
            }
        }
    });

    // 2. For each friendly factory
    const friendlyFactories = <Factory[]>entities.getFriendly(EntityType.FACTORY);
    const targetableFactories = (<Factory[]>entities.getNonFriendly(EntityType.FACTORY))
        .filter((f) => f.production > 0); // TEMP - ignore neutral bases with 0 production
    const friendlyTroops = <Troop[]>entities.getFriendly(EntityType.TROOP);
    
    friendlyFactories.forEach(factory => {
        // 2A - Attempt to attack an opposing factory
        targetableFactories.forEach((target) => {
            // Remove factories that are already under attack
            if (friendlyTroops.find((troop) => troop.targetId === target.id)) return false;

            const distance = map.getDistance(factory.id, target.id);

            // Remove non-adjacent factories
            if (distance === 0) return false; 
            
            const requiredCyborgs = target.cyborgsAfterTurns(distance+1) + 1; // TODO - is +1 necessary? Can we control with an even match?
            
            // Remove factories that are too powerful
            if (requiredCyborgs > factory.numCyborgs) return false; 

            // Remove the number of required cyborgs from the factories available cyborgs
            factory.numCyborgs -= requiredCyborgs;

            // Add move
            moves.attack(factory.id, target.id, requiredCyborgs);
            
            // Add this troop to the troop list to be considered by other factories
            friendlyTroops.push(new Troop(-1, 1, factory.id, target.id, requiredCyborgs, distance));
        });

        // 2B - Attempt to upgrade production
        if (factory.production < 3 && factory.numCyborgs >=10) {
            moves.inc(factory.id);
            factory.numCyborgs-=10;
        }
    })

    // Take turn
    moves.makeMoves();
}