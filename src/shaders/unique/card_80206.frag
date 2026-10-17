#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

float oval(vec2 p,vec2 c,vec2 r) {
    return 1.0-smoothstep(0.15,1.0,length((p-c)/r));
}

float stroke(vec2 p,vec2 a,vec2 b,float width,float aa) {
    vec2 q=(p-a)*vec2(1.0,1.4113);
    vec2 v=(b-a)*vec2(1.0,1.4113);
    float h=clamp(dot(q,v)/dot(v,v),0.0,1.0);
    return 1.0-smoothstep(width,width+aa,length(q-v*h));
}

void main() {
    vec4 original=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.113)*6.2831853;
    // Stop before the upper class ribbon and before the raised stat frames.
    float art=smoothstep(0.141,0.158,p.y)*(1.0-smoothstep(0.535,0.558,p.y));
    art*=smoothstep(0.009,0.027,p.x)*(1.0-smoothstep(0.974,0.993,p.x));
    art*=smoothstep(1.0,1.16,length((p-vec2(0.109,0.077))/vec2(0.085,0.066)));
    art*=smoothstep(1.0,1.16,length((p-vec2(0.882,0.076))/vec2(0.083,0.066)));
    if(art<=0.0) { gl_FragColor=original; return; }
    vec3 color=original.rgb;
    float faces=max(oval(p,vec2(0.466,0.238),vec2(0.059,0.067)),
                    oval(p,vec2(0.553,0.224),vec2(0.057,0.066)));
    float people=oval(p,vec2(0.507,0.332),vec2(0.153,0.161));

    // Flight: separate currents follow the long, burning flight feathers.
    float wing=0.0;
    for(int i=0;i<7;i++) {
        float k=float(i);
        float s=clamp((p.y-0.155)/0.405,0.0,1.0);
        float x=0.647+k*0.025+0.174*s-0.061*sin(s*3.14159265);
        x+=0.009*sin(s*7.0-t*2.4+k*0.65)*sin(s*3.14159265);
        float d=abs(p.x-x);
        float feather=1.0-smoothstep(0.0018,0.005+aa*0.65,d);
        float charge=pow(0.5+0.5*cos(s*11.0-t*4.8-k*0.67+seed),9.0);
        wing+=feather*(0.12+charge*0.88)*smoothstep(0.0,0.15,s);
    }
    color+=vec3(0.42,0.19,0.025)*wing*(1.0-faces);

    // Her cloak lifts in a second, slower current at the left of the embrace.
    float s=clamp((p.y-0.26)/0.30,0.0,1.0);
    float cloakX=0.365-0.31*s+0.035*sin(s*3.14159);
    float cloakD=abs(p.x-cloakX-0.011*sin(s*9.0-t*2.4));
    float cloak=(1.0-smoothstep(0.002,0.009+aa,cloakD))*sin(s*3.14159);
    float pulse=pow(0.5+0.5*cos(s*13.0+t*4.0+seed),5.0);
    color+=vec3(0.48,0.22,0.045)*cloak*(0.2+pulse);

    // A golden guard turns incoming fire toward the angel, then releases
    // blessing motes down around the protected figure's shoulder and cloak.
    float guard=0.0;
    for(int i=0;i<5;i++) {
        float k=float(i);
        float age=fract(t*0.34+k*0.2+seed*0.05);
        float theta=mix(3.45,0.40,age);
        vec2 pos=vec2(0.487,0.321)+vec2(cos(theta)*0.235,sin(theta)*0.151);
        vec2 tangent=normalize(vec2(sin(theta)*0.235,-cos(theta)*0.151));
        float life=smoothstep(0.0,0.12,age)*(1.0-smoothstep(0.82,1.0,age));
        guard+=stroke(p,pos,pos-tangent*0.043,0.0030,aa)*life;
        guard+=oval(p,pos,vec2(0.035,0.026))*0.28*life;
    }
    color+=vec3(0.57,0.36,0.075)*guard*(1.0-people*0.8);
    float blessing=0.0;
    for(int i=0;i<9;i++) {
        float k=float(i);
        float age=fract(t*0.25+k*0.1111+seed*0.03);
        float side=sin(k*7.13);
        vec2 pos=vec2(0.585-0.26*age+side*0.042*age,
                      0.330+0.217*age);
        pos.x+=sin(age*8.0+k)*0.018;
        float life=sin(age*3.14159265);
        vec2 q=(p-pos)*vec2(1.0,1.4113);
        float d=length(q);
        blessing+=(1.0-smoothstep(0.0025,0.0055+aa,d))*life;
        blessing+=stroke(p,pos,pos+vec2(0.011,-0.020),0.0012,aa)*life*0.55;
    }
    color+=vec3(0.54,0.43,0.13)*blessing*(1.0-faces);
    float palm=oval(p,vec2(0.587,0.329),vec2(0.036,0.033));
    color+=vec3(0.23,0.15,0.025)*palm*(0.6+0.4*sin(t*2.5));

    if(u_is_foil) {
        float feathers=oval(p,vec2(0.792,0.346),vec2(0.195,0.295));
        float cloth=oval(p,vec2(0.218,0.429),vec2(0.257,0.187));
        float mantle=oval(p,vec2(0.620,0.436),vec2(0.115,0.186));
        float metal=clamp(feathers+cloth+mantle*0.8,0.0,1.0)*(1.0-faces);
        float phase=p.x*2.2+p.y*3.0-t*0.16+seed*0.07;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        vec3 tint=mix(vec3(0.93,0.55,0.10),spectrum,0.70);
        float sheen=pow(0.5+0.5*cos(phase*6.2831853),8.0);
        color*=1.0-0.22*metal;
        color+=(1.0-color)*tint*metal*(0.27+0.46*sheen);
        color+=vec3(0.06,0.17,0.20)*wing*metal;
    }
    gl_FragColor=vec4(mix(original.rgb,clamp(color,0.0,1.0),art),original.a);
}
