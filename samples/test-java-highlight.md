# Java 代码高亮测试

## 基础语法

```java
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
```

## 类定义

```java
public class Person {
    private String name;
    private int age;
    
    public Person(String name, int age) {
        this.name = name;
        this.age = age;
    }
    
    public String getName() {
        return name;
    }
    
    public void setName(String name) {
        this.name = name;
    }
}
```

## 异常处理

```java
try {
    int result = 10 / 0;
} catch (ArithmeticException e) {
    System.err.println("除数不能为零");
} finally {
    System.out.println("执行完毕");
}
```
