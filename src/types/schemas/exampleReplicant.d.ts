export interface ExampleReplicant {
  firstName: string;
  lastName: string;
  /**
   * Age in years
   */
  age: number;
  hairColor?: 'black' | 'brown' | 'blue';
}
